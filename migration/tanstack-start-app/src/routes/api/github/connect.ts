import { createFileRoute } from "@tanstack/react-router";
import { completeGithubConnect } from "@/lib/server-fns/github";

/** Native /api/github/connect — OAuth callback: exchange code, save token, redirect. */
export const Route = createFileRoute("/api/github/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const r = await completeGithubConnect({
          data: { code: url.searchParams.get("code"), projectId: url.searchParams.get("state") },
        });
        return new Response(null, {
          status: 302,
          headers: { Location: new URL(r.redirectPath, request.url).toString() },
        });
      },
    },
  },
});
