import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { proxyAiToWorker } from "@/lib/ai-worker-client";

/**
 * Start-only /api/ai/agent — fast Start-cookie auth, then AI worker
 * (esbuild bundle of lib/ai/http/agent — never pulls the graph into Vite SSR).
 */
export const Route = createFileRoute("/api/ai/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const supabase = await createClient();
          const { user } = await getServerUser(supabase);
          if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          return proxyAiToWorker("agent", request);
        } catch (err) {
          console.error("[api/ai/agent]", err);
          return Response.json(
            { error: err instanceof Error ? err.message : "Agent failed" },
            { status: 500 },
          );
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
