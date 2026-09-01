import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Native /api/embed/status — public subscription-status check for the paywall
 * embed. GET ?projectId=&email= → { enabled, subscribed, status, price... }.
 *
 * Unlike every sibling embed endpoint, this had no rate limiting at all —
 * given any projectId it answers whether a SPECIFIC email has an active/
 * trialing subscription, which with no throttle is a working oracle for
 * enumerating one person's subscription status across many apps, or
 * brute-checking a candidate email list against one app's subscriber base.
 */
function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export const Route = createFileRoute("/api/embed/status")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin") ?? "*";
        return new Response(null, { status: 204, headers: { ...cors(origin), "Access-Control-Max-Age": "86400" } });
      },

      GET: async ({ request }) => {
        const origin = request.headers.get("origin") ?? "*";
        const sp = new URL(request.url).searchParams;
        const projectId = sp.get("projectId");
        const email = (sp.get("email") ?? "").toLowerCase();

        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400, headers: cors(origin) });

        const limit = rateLimit(`embed-status:${clientIp(request)}`, RATE_LIMITS.api);
        if (!limit.success) {
          return Response.json({ error: "Rate limit exceeded — slow down." }, { status: 429, headers: cors(origin) });
        }

        const supabase = createAdminClient();
        const { data: config } = await supabase
          .from("app_monetization")
          .select("enabled, price_cents, currency, trial_days")
          .eq("project_id", projectId)
          .maybeSingle();

        if (!config?.enabled) {
          return Response.json({ enabled: false, subscribed: true }, { headers: cors(origin) });
        }

        let subscribed = false;
        let status: string | null = null;
        if (email) {
          const { data: sub } = await supabase
            .from("app_subscriptions")
            .select("status")
            .eq("project_id", projectId)
            .eq("subscriber_email", email)
            .maybeSingle();
          status = sub?.status ?? null;
          subscribed = !!sub && ["active", "trialing"].includes(sub.status);
        }

        return Response.json({
          enabled: true,
          subscribed,
          status,
          price_cents: config.price_cents,
          currency: config.currency,
          trial_days: config.trial_days,
        }, { headers: cors(origin) });
      },
    },
  },
});
