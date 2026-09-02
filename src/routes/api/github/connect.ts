import { createFileRoute } from "@tanstack/react-router";
import { completeGithubConnect,completeGithubPatConnect } from "@/lib/server-fns/github";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Native /api/github/connect
 *   GET  — OAuth callback (signed state from /api/github/start)
 *   POST — personal access token + optional GitHub Enterprise Server host
 */
export const Route = createFileRoute("/api/github/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const r = await completeGithubConnect({ code: url.searchParams.get("code"), state: url.searchParams.get("state") });
        return new Response(null, {
          status: 302,
          headers: { Location: new URL(r.redirectPath, request.url).toString() },
        });
      },
      POST: async ({ request }) => {
        const rl = await rateLimitAsync("github-pat-connect", RATE_LIMITS.api);
        if (!rl.success) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
        const body = await request.json().catch(() => ({})) as { token?: string; host?: string };
        const r = await completeGithubPatConnect(body);
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "bad_request" || r.status === "bad_token") {
          return Response.json({ error: r.message }, { status: 400 });
        }
        if (r.status === "error") return Response.json({ error: r.message }, { status: 500 });
        return Response.json({ ok: true, username: r.username, enterprise: r.enterprise });
      },
    },
  },
});
