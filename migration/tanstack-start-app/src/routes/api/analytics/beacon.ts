import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Native /api/analytics/beacon — pageview/heartbeat sink for deployed apps.
 *   POST { projectId, visitorKey, path?, referrer?, event } — record activity
 *   GET  ?projectId=xxx — { activeVisitors, todayViews }
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/analytics/beacon")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const projectId = new URL(request.url).searchParams.get("projectId");
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400, headers: CORS });

        const supabase = createAdminClient();

        const { count: activeVisitors } = await supabase
          .from("app_visitors")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .gte("last_seen", new Date(Date.now() - 90_000).toISOString());

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const { count: todayViews } = await supabase
          .from("project_views")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .gte("created_at", startOfDay.toISOString());

        return Response.json({ activeVisitors: activeVisitors ?? 0, todayViews: todayViews ?? 0 }, { headers: CORS });
      },

      POST: async ({ request }) => {
        let body: { projectId?: string; visitorKey?: string; path?: string; referrer?: string; event?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
        }

        const { projectId, visitorKey, path = "/", referrer, event = "pageview" } = body;
        if (!projectId || !visitorKey) {
          return Response.json({ error: "projectId and visitorKey required" }, { status: 400, headers: CORS });
        }

        const supabase = createAdminClient();

        if (event === "leave") {
          await supabase
            .from("app_visitors").delete().eq("project_id", projectId).eq("visitor_key", visitorKey);
          return Response.json({ ok: true }, { headers: CORS });
        }

        const userAgent = request.headers.get("user-agent");

        await supabase
          .from("app_visitors")
          .upsert({
            project_id: projectId,
            visitor_key: visitorKey,
            path,
            referrer: referrer ?? null,
            user_agent: userAgent,
            last_seen: new Date().toISOString(),
          }, { onConflict: "project_id,visitor_key" });

        if (event === "pageview") {
          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
          const country = request.headers.get("cf-ipcountry") ?? null;
          const ipHash = ip
            ? Buffer.from(ip + (process.env.NEXT_PUBLIC_APP_URL ?? "salt")).toString("base64").slice(0, 16)
            : null;

          await supabase.from("project_views").insert({
            project_id: projectId,
            ip_hash: ipHash,
            referrer: referrer ?? null,
            country_code: country,
            path,
            user_agent: userAgent,
          });
        }

        if (Math.random() < 0.1) {
          try {
            await supabase.rpc("cleanup_stale_visitors");
          } catch {
            // Opportunistic cleanup must not fail analytics ingestion.
          }
        }

        return Response.json({ ok: true }, { headers: CORS });
      },
    },
  },
});
