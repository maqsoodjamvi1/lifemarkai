// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { PLANS, CREDIT_PACKS, getPlanByPriceId } from "@/lib/stripe/plans";
import { createAdminClient } from "@/lib/supabase/server";
import { sendCreditsPurchasedEmail } from "@/lib/email/resend";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = await createAdminClient();

  // ── Idempotency guard — Stripe retries events; skip if already processed ──
  // Uses the dedicated stripe_events table (migration 060). The old approach
  // logged into credit_logs with a sentinel user_id, which violated the FK to
  // profiles and silently never recorded anything — so retries double-credited.
  const { data: processed } = await (supabase as any)
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (processed) {
    return NextResponse.json({ received: true, skipped: "already processed" });
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  async function profileByCustomer(customerId: string) {
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id, email, full_name, credits, plan")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    return data;
  }

  /** Atomically add credits using the add_credits RPC (SECURITY DEFINER, no race condition). */
  async function creditUser(userId: string, amount: number, action: string, description: string) {
    // add_credits uses UPDATE ... SET credits = credits + p_amount — atomic, no read-modify-write
    const { error } = await (supabase as any).rpc("add_credits" as never, {
      p_user_id: userId,
      p_amount: amount,
    } as never);

    if (error) {
      // Absolute last-resort fallback using a DB-side increment expression
      await (supabase as any).rpc("deduct_credits" as never, {
        user_id: userId,
        amount: -amount, // negative = add
        action,
        project_id: null,
      } as never).catch(() => {});
    }

    await (supabase as any).from("credit_logs").insert({
      user_id: userId,
      amount,
      action,
      description,
    });
  }

  /** Atomically increment team credits using a DB-side expression. */
  async function creditTeam(teamId: string, amount: number, _description: string) {
    // Use a raw increment to avoid read-modify-write race conditions
    await (supabase as any).rpc("add_team_credits" as never, {
      p_team_id: teamId,
      p_amount: amount,
    } as never).catch(async () => {
      // Fallback if RPC missing — at least try
      const { data: team } = await (supabase as any).from("teams").select("credits").eq("id", teamId).single();
      if (team) {
        await (supabase as any).from("teams").update({ credits: (team.credits ?? 0) + amount }).eq("id", teamId);
      }
    });
  }

  // ── event routing ─────────────────────────────────────────────────────────
  switch (event.type) {

    // ── Subscription created / updated → update plan + credits ────────────
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const priceId    = sub.items.data[0]?.price.id ?? "";

      // App subscriptions (paywall embeds on apps built with LifemarkAI) are
      // tracked in app_subscriptions, not on the builder's profile.
      if (sub.metadata?.kind === "app_subscription") {
        const appProjectId = sub.metadata.lifemark_project_id;
        const subscriberEmail = (sub.metadata.subscriber_email ?? "").toLowerCase();
        if (appProjectId && subscriberEmail) {
          const status =
            sub.status === "trialing" ? "trialing"
            : sub.status === "past_due" ? "past_due"
            : ["canceled", "unpaid", "incomplete_expired"].includes(sub.status) ? "canceled"
            : "active";
          await (supabase as any).from("app_subscriptions").upsert({
            project_id:         appProjectId,
            subscriber_email:   subscriberEmail,
            stripe_customer_id: customerId,
            stripe_sub_id:      sub.id,
            status,
            trial_end:          sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            updated_at:         new Date().toISOString(),
          }, { onConflict: "project_id,subscriber_email" });
        }
        break;
      }

      const plan = getPlanByPriceId(priceId);
      if (!plan) break;

      const credits = plan.credits === -1 ? 99999 : plan.credits;

      const profile = await profileByCustomer(customerId);
      if (!profile) break;

      const isNewSub     = event.type === "customer.subscription.created";
      const planChanged  = profile.plan !== plan.id;

      // `subscription.updated` fires for payment-method changes, renewals,
      // cancellation scheduling, etc. — never reset the balance for those.
      // Monthly renewals (with rollover) are handled in `invoice.paid` below.
      if (!isNewSub && !planChanged) {
        await (supabase as any).from("profiles").update({
          stripe_subscription_id: sub.id,
          updated_at:             new Date().toISOString(),
        }).eq("id", profile.id);
        break;
      }

      // New subscription → fresh allowance.
      // Upgrade → top the balance up by the plan difference (Lovable behaviour:
      // "upgrading from 100 to 200 gives you 100 more, not 200 more").
      // Downgrade → keep the current balance; new allowance applies at renewal.
      let newCredits: number | null = credits;
      let logAmount  = credits;
      let logDesc    = `${plan.name} plan activated`;

      if (!isNewSub && planChanged) {
        const oldPlan = PLANS.find((p) => p.id === profile.plan);
        const oldCredits = oldPlan ? (oldPlan.credits === -1 ? 99999 : oldPlan.credits) : 0;
        const diff = credits - oldCredits;
        if (diff > 0) {
          newCredits = (profile.credits ?? 0) + diff;
          logAmount  = diff;
          logDesc    = `Upgraded to ${plan.name}: +${diff} credits`;
        } else {
          newCredits = null; // downgrade — leave balance untouched
          logAmount  = 0;
          logDesc    = `Changed to ${plan.name} plan`;
        }
      }

      await (supabase as any).from("profiles").update({
        plan:                    plan.id,
        ...(newCredits !== null ? { credits: newCredits } : {}),
        stripe_subscription_id:  sub.id,
        updated_at:              new Date().toISOString(),
      }).eq("id", profile.id);

      await (supabase as any).from("credit_logs").insert({
        user_id:     profile.id,
        amount:      logAmount,
        action:      "subscription",
        description: logDesc,
      });

      if (isNewSub && profile.email) {
        const price = plan.monthlyPrice > 0 ? `$${(plan.monthlyPrice / 100).toFixed(0)}/mo` : "Free";
        await sendCreditsPurchasedEmail(profile.email, credits, price).catch(console.error);
      }
      break;
    }

    // ── Monthly renewal → refill with rollover ─────────────────────────────
    // Unused credits from the previous cycle carry over, capped at one month's
    // plan allowance: new_balance = LEAST(current, plan) + plan (migration 063).
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason !== "subscription_cycle") break;

      const customerId = invoice.customer as string;
      const profile = await profileByCustomer(customerId);
      if (!profile) break;

      const plan = PLANS.find((p) => p.id === profile.plan);
      if (!plan || plan.credits <= 0) break; // free/enterprise — nothing to refill

      const { data: newBalance, error } = await (supabase as any).rpc("apply_plan_renewal" as never, {
        p_user_id:      profile.id,
        p_plan_credits: plan.credits,
      } as never);

      if (error) {
        // Fallback (pre-063 DB): plain refill without rollover
        await (supabase as any).from("profiles").update({
          credits:    plan.credits,
          updated_at: new Date().toISOString(),
        }).eq("id", profile.id);
      } else {
        console.log(`Renewal applied for ${profile.id}: balance ${newBalance}`);
      }
      break;
    }

    // ── Subscription cancelled → downgrade to free ────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;

      // App subscription cancelled → mark the subscriber as canceled.
      if (sub.metadata?.kind === "app_subscription") {
        await (supabase as any)
          .from("app_subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_sub_id", sub.id);
        break;
      }

      const profile = await profileByCustomer(sub.customer as string);
      if (!profile) break;

      const freePlan = PLANS.find((p) => p.id === "free")!;
      await (supabase as any).from("profiles").update({
        plan:                   "free",
        credits:                freePlan.credits,
        stripe_subscription_id: null,
        updated_at:             new Date().toISOString(),
      }).eq("id", profile.id);

      await (supabase as any).from("credit_logs").insert({
        user_id:     profile.id,
        amount:      freePlan.credits,
        action:      "subscription",
        description: "Downgraded to Free plan",
      });
      break;
    }

    // ── One-time credit pack purchase ─────────────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Session;
      if (session.mode !== "payment") break;
      if (session.payment_status !== "paid") break;

      const meta    = session.metadata ?? {};
      const userId  = meta.userId;
      const teamId  = meta.teamId || null;
      const packKey = meta.packKey;
      const credits = parseInt(meta.credits ?? "0");

      if (!userId || !packKey || !credits) break;

      // Mark pack as paid
      await (supabase as any)
        .from("credit_packs")
        .update({ status: "paid", stripe_session_id: session.id })
        .eq("stripe_session_id", session.id);

      if (teamId) {
        // Credit team pool
        await creditTeam(teamId, credits, `Credit pack: ${packKey}`);
        // Also log for the purchasing user
        await (supabase as any).from("credit_logs").insert({
          user_id:     userId,
          amount:      credits,
          action:      "credit_purchase",
          description: `Bought ${credits} credits for team pool (pack: ${packKey})`,
        });
      } else {
        // Credit personal balance — use atomic RPC to avoid race conditions
        await creditUser(userId, credits, "credit_purchase", `Bought ${credits} credits (pack: ${packKey})`);

        // Send confirmation email (needs email + pack name — fetch profile separately)
        const { data: p } = await (supabase as any).from("profiles").select("email").eq("id", userId).single();
        const pack = CREDIT_PACKS.find((pk) => pk.key === packKey);
        if (p?.email && pack) {
          const price = `$${(pack.priceCents / 100).toFixed(0)} one-time`;
          await sendCreditsPurchasedEmail(p.email, credits, price).catch(console.error);
        }
      }
      break;
    }

    // ── Payment failed → notify, don't remove access yet ─────────────────
    case "invoice.payment_failed": {
      const invoice    = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const profile    = await profileByCustomer(customerId);
      if (!profile?.email) break;

      // Log event for internal visibility; email handled by Stripe's dunning
      console.warn(`Payment failed for user ${profile.id}`);
      break;
    }

    default:
      break;
  }

  // ── Mark this event as processed (idempotency key) ────────────────────────
  await (supabase as any).from("stripe_events").insert({
    id: event.id,
    type: event.type,
  }).then(() => {}).catch(() => {}); // best-effort; don't fail the response

  return NextResponse.json({ received: true });
}
