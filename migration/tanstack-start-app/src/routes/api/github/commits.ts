import { createFileRoute } from "@tanstack/react-router";
import { getRepoCommits } from "@/lib/server-fns/github";

/** Native /api/github/commits — commit history for a connected repo. */
export const Route = createFileRoute("/api/github/commits")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sp = new URL(request.url).searchParams;
        const r = await getRepoCommits({
          data: {
            owner: sp.get("owner") ?? "",
            repo: sp.get("repo") ?? "",
            perPage: parseInt(sp.get("perPage") || "20", 10),
          },
        });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "bad_request") return Response.json({ error: "Missing owner or repo" }, { status: 400 });
        if (r.status === "not_connected") return Response.json({ error: "GitHub not connected" }, { status: 401 });
        if (r.status === "error") return Response.json({ error: r.message }, { status: 500 });
        return Response.json({ commits: r.commits });
      },
    },
  },
});
