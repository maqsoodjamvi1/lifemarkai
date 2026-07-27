// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Native /api/embed/checkout — public Stripe Checkout for monetized apps.
 * POST { projectId, email, successUrl?, cancelUrl? } → { url }. Lazily creates
 * the app's Stripe product/price and persists to app_monetization.
 */
function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const Route = createFileRoute("/api/embed/checkout")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin") ?? "*";
        return new Response(null, { status: 204, headers: { ...cors(origin), "Access-Control-Max-Age": "86400" } });
      },

      POST: async ({ request }) => {
        const origin = request.headers.get("origin") ?? "*";

        let body: { projectId?: string; email?: string; successUrl?: string; cancelUrl?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400, headers: cors(origin) });
        }
        const { projectId, email, successUrl, cancelUrl } = body;
        if (!projectId || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return Response.json({ error: "projectId and a valid email are required" }, { status: 400, headers: cors(origin) });
        }

        const supabase = createAdminClient();

        const [{ data: config }, { data: project }] = await Promise.all([
          supabase.from("app_monetization").select("*").eq("project_id", projectId).maybeSingle(),
          supabase.from("projects").select("id, name, deployed_url").eq("id", projectId).single(),
        ]);

        if (!project) return Response.json({ error: "Project not found" }, { status: 404, headers: cors(origin) });
        if (!config?.enabled || !config.price_cents || config.price_cents <= 0) {
          return Response.json({ error: "Payments are not enabled for this app" }, { status: 403, headers: cors(origin) });
        }

        const { data: existing } = await supabase
          .from("app_subscriptions")
          .select("status")
          .eq("project_id", projectId)
          .eq("subscriber_email", email.toLowerCase())
          .maybeSingle();
        if (existing && ["active", "trialing"].includes(existing.status)) {
          return Response.json({ error: "Already subscribed", alreadySubscribed: true }, { status: 409, headers: cors(origin) });
        }

        try {
          let priceId: string | null = config.stripe_price_id;
          if (!priceId) {
            const product = config.stripe_product_id
              ? { id: config.stripe_product_id }
              : await stripe.products.create({
                  name: `${project.name} — subscription`,
                  metadata: { lifemark_project_id: projectId },
                });
            const price = await stripe.prices.create({
              product: product.id,
              unit_amount: config.price_cents,
              currency: config.currency ?? "usd",
              recurring: { interval: "month" },
              metadata: { lifemark_project_id: projectId },
            });
            priceId = price.id;
            await supabase
              .from("app_monetization")
              .update({ stripe_product_id: product.id, stripe_price_id: priceId, updated_at: new Date().toISOString() })
              .eq("project_id", projectId);
          }

          const appUrl = project.deployed_url ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer_email: email.toLowerCase(),
            line_items: [{ price: priceId, quantity: 1 }],
            ...(config.trial_days > 0
              ? { subscription_data: { trial_period_days: config.trial_days, metadata: { kind: "app_subscription", lifemark_project_id: projectId, subscriber_email: email.toLowerCase() } } }
              : { subscription_data: { metadata: { kind: "app_subscription", lifemark_project_id: projectId, subscriber_email: email.toLowerCase() } } }),
            success_url: successUrl ?? `${appUrl}?subscribed=1`,
            cancel_url: cancelUrl ?? appUrl,
            metadata: {
              kind: "app_subscription",
              lifemark_project_id: projectId,
              subscriber_email: email.toLowerCase(),
            },
          });

          return Response.json({ url: session.url }, { headers: cors(origin) });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Checkout failed" },
            { status: 502, headers: cors(origin) },
          );
        }
      },
    },
  },
});
