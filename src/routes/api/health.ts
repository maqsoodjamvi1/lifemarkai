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
        let aiWorker = "ok";
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
        try {
          const workerBase =
            process.env.LIFEMARK_AI_WORKER_URL ||
            `http://${process.env.LIFEMARK_AI_WORKER_HOST || "127.0.0.1"}:${process.env.LIFEMARK_AI_WORKER_PORT || "3010"}`;
          const res = await fetch(`${workerBase}/health`, { signal: AbortSignal.timeout(1500) });
          const data = (await res.json()) as { ok?: boolean };
          aiWorker = res.ok && data.ok ? "ok" : "error";
        } catch {
          aiWorker = "error";
        }
        const healthy = db === "ok";
        return Response.json(
          {
            status: healthy ? "ok" : "degraded",
            db,
            aiWorker,
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
