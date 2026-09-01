import { createFileRoute } from "@tanstack/react-router";
import { verifyPaddleSignature } from "@/lib/paddle/webhook";
import { getPlanByPaddlePriceId } from "@/lib/paddle/plans";
import { PLANS } from "@/lib/stripe/plans";
import { createAdminClient } from "@/lib/supabase/server";
import { sendCreditsPurchasedEmail } from "@/lib/email/resend";
import { recordEvent } from "@/lib/observability/events";

/**
 * Native /api/billing/paddle-webhook — Paddle's counterpart to
 * /api/billing/webhook (Stripe). Same shape: raw-body signature
 * verification, a dedicated idempotency table (paddle_events, mirroring
 * stripe_events), then apply the plan/credits change to `profiles`.
 *
 * Scope: subscription.created / subscription.updated / subscription.canceled
 * only — the events created by /api/billing/paddle-checkout's subscription
 * flow. Paddle's one-off credit-pack and domain-purchase equivalents aren't
 * wired (those still go through Stripe only); extending this to cover them
 * follows the same pattern as the case blocks already in webhook.ts.
 *
 * profiles.paddle_customer_id / paddle_subscription_id aren't in the
 * committed generated Supabase types yet (no live DB connection to run
 * codegen in this environment) — see billing-paddle.ts's header comment for
 * why the `as never`/`as any` casts below are the same pattern already used
 * for RPCs elsewhere in this file's Stripe counterpart.
 */
export const Route = createFileRoute("/api/billing/paddle-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const sig = request.headers.get("paddle-signature");
        const secret = process.env.PADDLE_WEBHOOK_SECRET;

        if (!sig || !secret) {
          recordEvent("paddle_webhook_rejected", { reason: "missing_signature" });
          return Response.json({ error: "Missing Paddle signature" }, { status: 400 });
        }
        if (!verifyPaddleSignature(body, sig, secret)) {
          recordEvent("paddle_webhook_rejected", { reason: "invalid_signature" });
          return Response.json({ error: "Invalid signature" }, { status: 400 });
        }

        let event: { event_id: string; event_type: string; data: Record<string, unknown> };
        try {
          event = JSON.parse(body);
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        recordEvent("paddle_webhook_received", { eventType: event.event_type, eventId: event.event_id });

        const supabase = createAdminClient();

        const { error: claimError } = await supabase.from("paddle_events" as never).insert({
          id: event.event_id,
          type: event.event_type,
          status: "processing",
          claimed_at: new Date().toISOString(),
        } as never);
        if (claimError) {
          if ((claimError as { code?: string }).code === "23505") {
            return Response.json({ received: true, skipped: "already claimed" });
          }
          console.error("Unable to claim Paddle event", event.event_id, claimError);
          return Response.json({ error: "Unable to claim webhook event" }, { status: 500 });
        }

        async function profileByPaddleCustomer(customerId: string) {
          const { data } = await supabase
            .from("profiles")
            .select("id, email, credits, plan, paddle_customer_id" as never)
            .eq("paddle_customer_id" as never, customerId)
            .maybeSingle();
          return data as unknown as { id: string; email: string | null; credits: number; plan: string } | null;
        }
        // Same atomic RPC used by the Stripe webhook's creditUser (locked
        // UPDATE + relative increment, migration 085) - see the plan-change
        // branch below for why the additive case can't be a plain UPDATE.
        async function creditUser(userId: string, amount: number, action: string, description: string) {
          const { error } = await supabase.rpc("add_credits" as never, {
            p_user_id: userId, p_amount: amount, p_action: action, p_description: description,
          } as never);
          if (error) throw new Error(`Unable to credit user: ${error.message}`);
        }

        try {
          switch (event.event_type) {
            case "subscription.created":
            case "subscription.updated": {
              const sub = event.data as {
                id: string;
                customer_id: string;
                status: string;
                items?: Array<{ price?: { id?: string } }>;
              };
              const priceId = sub.items?.[0]?.price?.id ?? "";
              const plan = getPlanByPaddlePriceId(priceId);
              if (!plan) break;
              if (!["active", "trialing"].includes(sub.status)) break;

              const profile = await profileByPaddleCustomer(sub.customer_id);
              if (!profile) break;

              const isNewSub = event.event_type === "subscription.created";
              const planChanged = profile.plan !== plan.id;
              const credits = plan.credits === -1 ? 99999 : plan.credits;

              if (!isNewSub && !planChanged) {
                await supabase.from("profiles").update({
                  paddle_subscription_id: sub.id, updated_at: new Date().toISOString(),
                } as never).eq("id", profile.id);
                break;
              }

              // See webhook.ts's identical branch: a new subscription sets
              // credits to the plan's fixed allotment (a literal, safe as a
              // plain UPDATE); a plan CHANGE computes an additive diff over
              // `profile.credits`, which was read a moment ago - that case
              // is routed through the atomic add_credits RPC instead of a
              // plain UPDATE to avoid a lost-update race against a
              // concurrent credit mutation on the same profile row.
              let logAmount = credits;
              let logDesc = `${plan.name} plan activated (Paddle)`;
              let creditDelta: number | null = null;
              if (!isNewSub && planChanged) {
                const oldPlan = PLANS.find((p) => p.id === profile.plan);
                const oldCredits = oldPlan ? (oldPlan.credits === -1 ? 99999 : oldPlan.credits) : 0;
                const diff = credits - oldCredits;
                if (diff > 0) {
                  creditDelta = diff;
                  logAmount = diff;
                  logDesc = `Upgraded to ${plan.name}: +${diff} credits (Paddle)`;
                } else {
                  logAmount = 0;
                  logDesc = `Changed to ${plan.name} plan (Paddle)`;
                }
              }

              await supabase.from("profiles").update({
                plan: plan.id,
                ...(isNewSub ? { credits } : {}),
                paddle_subscription_id: sub.id,
                updated_at: new Date().toISOString(),
              } as never).eq("id", profile.id);

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

            case "subscription.canceled": {
              const sub = event.data as { customer_id: string };
              const profile = await profileByPaddleCustomer(sub.customer_id);
              if (!profile) break;
              const freePlan = PLANS.find((p) => p.id === "free")!;
              await supabase.from("profiles").update({
                plan: "free", credits: freePlan.credits, paddle_subscription_id: null, updated_at: new Date().toISOString(),
              } as never).eq("id", profile.id);
              await supabase.from("credit_logs").insert({
                user_id: profile.id, amount: freePlan.credits, action: "subscription", description: "Downgraded to Free plan (Paddle)",
              });
              break;
            }

            default:
              break;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await supabase.from("paddle_events" as never)
            .update({ status: "failed", last_error: message.slice(0, 2000) } as never)
            .eq("id", event.event_id);
          console.error("Paddle webhook handling failed", event.event_id, error);
          return Response.json({ error: "Webhook handling failed" }, { status: 500 });
        }

        const completedAt = new Date().toISOString();
        const { error: completionError } = await supabase.from("paddle_events" as never).update({
          status: "completed", completed_at: completedAt, last_error: null,
        } as never).eq("id", event.event_id);
        if (completionError) {
          console.error("Unable to complete Paddle event claim", event.event_id, completionError);
          return Response.json({ error: "Unable to complete webhook event" }, { status: 500 });
        }

        return Response.json({ received: true });
      },
    },
  },
});
