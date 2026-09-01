import { createFileRoute } from "@tanstack/react-router";
import { completeGithubConnect } from "@/lib/server-fns/github";

/**
 * Native /api/github/connect — OAuth callback: verify the signed state
 * minted by /api/github/start, exchange code, save token, redirect. The
 * `state` query param is passed straight through to completeGithubConnect
 * for verification there (see that function's header comment) rather than
 * trusted directly as a project id.
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
    },
  },
});
