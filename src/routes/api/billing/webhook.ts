import { createFileRoute } from "@tanstack/react-router";
import { stripe } from "@/lib/stripe/client";
import { PLANS,CREDIT_PACKS,getPlanByPriceId } from "@/lib/stripe/plans";
import { createAdminClient } from "@/lib/supabase/server";
import { sendCreditsPurchasedEmail } from "@/lib/email/resend";
import { completeDomainPurchase } from "@/lib/domains/complete-domain-purchase";
import type { RegistrantContact } from "@/lib/domains/registrar";
import type Stripe from "stripe";
import { recordEvent } from "@/lib/observability/events";

/**
 * Native /api/billing/webhook — Stripe webhook (off the worker).
 * Raw body via request.text() → constructEvent for signature verification.
 * Faithful port of app/api/billing/webhook/route.ts.
 */
export const Route = createFileRoute("/api/billing/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const sig = request.headers.get("stripe-signature");

        if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
          recordEvent("stripe_webhook_rejected", { reason: "missing_signature" });
          return Response.json({ error: "Missing stripe signature" }, { status: 400 });
        }

        let event: Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        } catch {
          recordEvent("stripe_webhook_rejected", { reason: "invalid_signature" });
          return Response.json({ error: "Invalid signature" }, { status: 400 });
        }
        // Only the event TYPE and id — never the payload (customer emails,
        // amounts and addresses live in there).
        recordEvent("stripe_webhook_received", { eventType: event.type, eventId: event.id });

        const supabase = createAdminClient();

        // Idempotency guard — claim the event id (stripe_events PK insert).
        const { error: claimError } = await supabase.from("stripe_events").insert({
          id: event.id,
          type: event.type,
          status: "processing",
          claimed_at: new Date().toISOString(),
        });
        if (claimError) {
          if (claimError.code === "23505") {
            return Response.json({ received: true, skipped: "already claimed" });
          }
          console.error("Unable to claim Stripe event", event.id, claimError);
          return Response.json({ error: "Unable to claim webhook event" }, { status: 500 });
        }

        async function profileByCustomer(customerId: string) {
          const { data } = await supabase
            .from("profiles")
            .select("id, email, full_name, credits, plan")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          return data;
        }
        async function creditUser(userId: string, amount: number, action: string, description: string) {
          const { error } = await supabase.rpc("add_credits" as never, {
            p_user_id: userId, p_amount: amount, p_action: action, p_description: description,
          } as never);
          if (error) throw new Error(`Unable to credit user: ${error.message}`);
        }
        async function creditTeam(teamId: string, amount: number, description: string) {
          const { error } = await supabase.rpc("add_team_credits" as never, {
            p_team_id: teamId, p_amount: amount, p_description: description,
          } as never);
          if (error) throw new Error(`Unable to credit team: ${error.message}`);
        }

        try {
          switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated": {
              const sub = event.data.object as Stripe.Subscription;
              const customerId = sub.customer as string;
              const priceId = sub.items.data[0]?.price.id ?? "";

              if (sub.metadata?.kind === "app_subscription") {
                const appProjectId = sub.metadata.lifemark_project_id;
                const subscriberEmail = (sub.metadata.subscriber_email ?? "").toLowerCase();
                if (appProjectId && subscriberEmail) {
                  const status =
                    sub.status === "trialing" ? "trialing"
                    : sub.status === "past_due" ? "past_due"
                    : ["canceled", "unpaid", "incomplete_expired"].includes(sub.status) ? "canceled"
                    : "active";
                  await supabase.from("app_subscriptions").upsert({
                    project_id: appProjectId,
                    subscriber_email: subscriberEmail,
                    stripe_customer_id: customerId,
                    stripe_sub_id: sub.id,
                    status,
                    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
                    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
                    updated_at: new Date().toISOString(),
                  }, { onConflict: "project_id,subscriber_email" });
                }
                break;
              }

              const plan = getPlanByPriceId(priceId);
              if (!plan) break;
              const credits = plan.credits === -1 ? 99999 : plan.credits;
              const profile = await profileByCustomer(customerId);
              if (!profile) break;

              const isNewSub = event.type === "customer.subscription.created";
              const planChanged = profile.plan !== plan.id;

              if (!isNewSub && !planChanged) {
                await supabase.from("profiles").update({
                  stripe_subscription_id: sub.id, updated_at: new Date().toISOString(),
                }).eq("id", profile.id);
                break;
              }

              // A brand-new subscription sets credits to the plan's fixed
              // allotment - a literal value independent of the profile's
              // current balance, so a plain UPDATE is safe (nothing here
              // depends on the earlier read). A plan CHANGE on an existing
              // subscription instead computes an ADDITIVE diff over
              // `profile.credits`, which WAS read a moment ago in this same
              // request (see profileByCustomer above) - applying that as a
              // plain UPDATE is a lost-update race: any concurrent credit
              // mutation on the same profile row (another webhook delivery,
              // a credit-pack purchase settling at the same time, etc.) can
              // have its change silently overwritten by whichever write
              // lands last. Route the additive case through the same
              // atomic add_credits RPC (locked UPDATE + relative increment,
              // migration 085) already used elsewhere in this file for
              // exactly this reason - it also logs credit_logs itself, so
              // that insert is only done manually for the non-additive
              // (downgrade/lateral) case below.
              let logAmount = credits;
              let logDesc = `${plan.name} plan activated`;
              let creditDelta: number | null = null;
              if (!isNewSub && planChanged) {
                const oldPlan = PLANS.find((p) => p.id === profile.plan);
                const oldCredits = oldPlan ? (oldPlan.credits === -1 ? 99999 : oldPlan.credits) : 0;
                const diff = credits - oldCredits;
                if (diff > 0) {
                  creditDelta = diff;
                  logAmount = diff;
                  logDesc = `Upgraded to ${plan.name}: +${diff} credits`;
                } else {
                  logAmount = 0;
                  logDesc = `Changed to ${plan.name} plan`;
                }
              }

              await supabase.from("profiles").update({
                plan: plan.id,
                ...(isNewSub ? { credits } : {}),
                stripe_subscription_id: sub.id,
                updated_at: new Date().toISOString(),
              }).eq("id", profile.id);

              if (creditDelta !== null) {
                await creditUser(profile.id, creditDelta, "subscription", logDesc);
              } else {
                await supabase.from("credit_logs").insert({
                  user_id: profile.id, amount: logAmount, action: "subscription", description: logDesc,
                });
              }

              if (isNewSub && profile.email) {
                const price = plan.monthlyPrice > 0 ? `$${(plan.monthlyPrice / 100).toFixed(0)}/mo` : "Free";
                await sendCreditsPurchasedEmail(profile.email, credits, price).catch(console.error);
              }
              break;
            }

            case "invoice.paid": {
              const invoice = event.data.object as Stripe.Invoice;
              if (invoice.billing_reason !== "subscription_cycle") break;
              const customerId = invoice.customer as string;
              const profile = await profileByCustomer(customerId);
              if (!profile) break;
              const plan = PLANS.find((p) => p.id === profile.plan);
              if (!plan || plan.credits <= 0) break;

              const { error } = await supabase.rpc("apply_plan_renewal" as never, {
                p_user_id: profile.id, p_plan_credits: plan.credits,
              } as never);
              if (error) {
                await supabase.from("profiles").update({
                  credits: plan.credits, updated_at: new Date().toISOString(),
                }).eq("id", profile.id);
              }
              break;
            }

            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              if (sub.metadata?.kind === "app_subscription") {
                await supabase.from("app_subscriptions")
                  .update({ status: "canceled", updated_at: new Date().toISOString() })
                  .eq("stripe_sub_id", sub.id);
                break;
              }
              const profile = await profileByCustomer(sub.customer as string);
              if (!profile) break;
              const freePlan = PLANS.find((p) => p.id === "free")!;
              await supabase.from("profiles").update({
                plan: "free", credits: freePlan.credits, stripe_subscription_id: null, updated_at: new Date().toISOString(),
              }).eq("id", profile.id);
              await supabase.from("credit_logs").insert({
                user_id: profile.id, amount: freePlan.credits, action: "subscription", description: "Downgraded to Free plan",
              });
              break;
            }

            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              if (session.mode !== "payment") break;
              if (session.payment_status !== "paid") break;
              const meta = session.metadata ?? {};

              if (meta.kind === "domain_purchase") {
                const userId = meta.userId;
                const projectId = meta.projectId;
                const domain = meta.domain;
                const years = parseInt(meta.years ?? "1", 10);
                let contact: RegistrantContact | null = null;
                try {
                  contact = JSON.parse(meta.contactJson ?? "null") as RegistrantContact;
                } catch {
                  contact = null;
                }
                if (userId && projectId && domain && contact) {
                  const amount = session.amount_total ?? 0;
                  await completeDomainPurchase({ projectId, userId, domain, contact, years, priceCents: amount, stripeRef: session.id });
                }
                break;
              }

              const userId = meta.userId;
              const teamId = meta.teamId || null;
              const packKey = meta.packKey;
              const credits = parseInt(meta.credits ?? "0");
              if (!userId || !packKey || !credits) break;

              await supabase.from("credit_packs")
                .update({ status: "paid", stripe_session_id: session.id })
                .eq("stripe_session_id", session.id);

              if (teamId) {
                await creditTeam(teamId, credits, `Credit pack: ${packKey}`);
                await supabase.from("credit_logs").insert({
                  user_id: userId, amount: credits, action: "credit_purchase",
                  description: `Bought ${credits} credits for team pool (pack: ${packKey})`,
                });
              } else {
                await creditUser(userId, credits, "credit_purchase", `Bought ${credits} credits (pack: ${packKey})`);
                const { data: p } = await supabase.from("profiles").select("email").eq("id", userId).single();
                const pack = CREDIT_PACKS.find((pk) => pk.key === packKey);
                if (p?.email && pack) {
                  const price = `$${(pack.priceCents / 100).toFixed(0)} one-time`;
                  await sendCreditsPurchasedEmail(p.email, credits, price).catch(console.error);
                }
              }
              break;
            }

            case "invoice.payment_failed": {
              const invoice = event.data.object as Stripe.Invoice;
              const profile = await profileByCustomer(invoice.customer as string);
              if (!profile?.email) break;
              console.warn(`Payment failed for user ${profile.id}`);
              break;
            }

            default:
              break;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await supabase.from("stripe_events")
            .update({ status: "failed", last_error: message.slice(0, 2000) })
            .eq("id", event.id);
          console.error("Stripe webhook handling failed", event.id, error);
          return Response.json({ error: "Webhook handling failed" }, { status: 500 });
        }

        const completedAt = new Date().toISOString();
        const { error: completionError } = await supabase.from("stripe_events").update({
          status: "completed", processed_at: completedAt, completed_at: completedAt, last_error: null,
        }).eq("id", event.id);
        if (completionError) {
          console.error("Unable to complete Stripe event claim", event.id, completionError);
          return Response.json({ error: "Unable to complete webhook event" }, { status: 500 });
        }

        return Response.json({ received: true });
      },
    },
  },
});
