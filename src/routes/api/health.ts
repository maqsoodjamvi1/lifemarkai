import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

const PROCESS_STARTED_MS = Date.now();

/**
 * Native /api/health — avoids adapter/Vite graph for the readiness probe.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        let db = "ok";
        try {
          const supabase = await createClient();
          const timedOut = { error: { message: "timeout" } } as const;
          const { error } = await Promise.race([
            supabase.from("templates").select("id", { count: "exact", head: true }).limit(1),
            new Promise<typeof timedOut>((resolve) => {
              setTimeout(() => resolve(timedOut), 2000);
            }),
          ]);
          if (error) db = "error";
        } catch {
          db = "error";
        }
        const healthy = db === "ok";
        return Response.json(
          {
            status: healthy ? "ok" : "degraded",
            db,
            uptimeSeconds: Math.floor((Date.now() - PROCESS_STARTED_MS) / 1000),
            runtime: "tanstack-start",
            timestamp: new Date().toISOString(),
          },
          { status: healthy ? 200 : 503 },
        );
      },
    },
  },
});
