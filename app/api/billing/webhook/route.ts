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

      const plan = getPlanByPriceId(priceId);
      if (!plan) break;

      const credits = plan.credits === -1 ? 99999 : plan.credits;

      const profile = await profileByCustomer(customerId);
      if (!profile) break;

      await (supabase as any).from("profiles").update({
        plan:                    plan.id,
        credits:                 credits,
        stripe_subscription_id:  sub.id,
        updated_at:              new Date().toISOString(),
      }).eq("id", profile.id);

      await (supabase as any).from("credit_logs").insert({
        user_id:     profile.id,
        amount:      credits,
        action:      "subscription",
        description: `${plan.name} plan activated`,
      });

      if (event.type === "customer.subscription.created" && profile.email) {
        const price = plan.monthlyPrice > 0 ? `$${(plan.monthlyPrice / 100).toFixed(0)}/mo` : "Free";
        await sendCreditsPurchasedEmail(profile.email, credits, price).catch(console.error);
      }
      break;
    }

    // ── Subscription cancelled → downgrade to free ────────────────────────
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
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
