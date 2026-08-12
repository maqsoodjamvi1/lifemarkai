import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/health — avoids adapter/Vite graph for the readiness probe.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        let db = "ok";
        try {
          const supabase = await createClient();
          const { error } = await supabase
            .from("templates")
            .select("id", { count: "exact", head: true })
            .limit(1);
          if (error) db = "error";
        } catch {
          db = "error";
        }
        const healthy = db === "ok";
        return Response.json(
          {
            status: healthy ? "ok" : "degraded",
            db,
            uptimeSeconds: Math.floor((Date.now() - started) / 1000),
            runtime: "tanstack-start",
            timestamp: new Date().toISOString(),
          },
          { status: healthy ? 200 : 503 },
        );
      },
    },
  },
});
