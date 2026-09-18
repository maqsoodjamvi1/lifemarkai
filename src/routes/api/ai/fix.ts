import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { proxyAiToWorker } from "@/lib/ai-worker-client";

/**
 * Start-only /api/ai/fix — fast Start-cookie auth, then AI worker
 * (esbuild bundle of lib/ai/http/fix — never pulls generateAI into Vite SSR).
 *
 * The previous inline copy sent the first 10 files, skipped the project
 * contract, and never minted an attempt trace. Chat and agent already proxy;
 * auto-fix has to as well or those constraints stay dead.
 */
export const Route = createFileRoute("/api/ai/fix")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const supabase = await createClient();
          const { user } = await getServerUser(supabase);
          if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          return proxyAiToWorker("fix", request);
        } catch (err) {
          console.error("[api/ai/fix]", err);
          return Response.json(
            { error: err instanceof Error ? err.message : "Fix failed" },
            { status: 500 },
          );
        }
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
