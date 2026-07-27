// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import {
  getKeywordMetrics,
  getRelatedKeywords,
  getDomainOverview,
  isSemrushConfigured,
  SemrushNotConfiguredError,
  type SemrushDatabase,
} from "@/lib/integrations/semrush";

/** Native /api/integrations/semrush — keyword/related/domain SEO metrics. */
const VALID_DB = new Set(["us", "uk", "ca", "au", "de", "fr", "es", "it", "br", "in"]);

export const Route = createFileRoute("/api/integrations/semrush")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const sp = new URL(request.url).searchParams;
        const action = sp.get("action") ?? "keyword";
        const q = sp.get("q")?.trim();
        const dbParam = (sp.get("database") ?? "us").toLowerCase();
        const database = (VALID_DB.has(dbParam) ? dbParam : "us") as SemrushDatabase;

        if (!q) return Response.json({ error: "Missing query parameter q" }, { status: 400 });

        if (!isSemrushConfigured()) {
          return Response.json({
            configured: false,
            error: "Semrush API key not configured. Add SEMRUSH_API_KEY to your server environment.",
          }, { status: 503 });
        }

        try {
          if (action === "domain") {
            const domain = await getDomainOverview(q, database);
            return Response.json({ configured: true, action, domain });
          }
          if (action === "related") {
            const related = await getRelatedKeywords(q, database);
            return Response.json({ configured: true, action, related });
          }
          const [keyword, related] = await Promise.all([
            getKeywordMetrics(q, database),
            getRelatedKeywords(q, database, 8),
          ]);
          return Response.json({ configured: true, action: "keyword", keyword, related });
        } catch (err) {
          if (err instanceof SemrushNotConfiguredError) {
            return Response.json({ configured: false, error: err.message }, { status: 503 });
          }
          const message = err instanceof Error ? err.message : "Semrush request failed";
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
