import { createFileRoute } from "@tanstack/react-router";
import { importGithubRepo } from "@/lib/server-fns/github-import";

/** Native /api/github/import — clone a public/connected repo into a new project (off the worker). */
export const Route = createFileRoute("/api/github/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { repoUrl?: string; branch?: string };
        const r = await importGithubRepo({ repoUrl: body.repoUrl ?? "", branch: body.branch });
        if (r.status === "error") {
          return Response.json({ error: r.message, ...(r.extra ?? {}) }, { status: r.code });
        }
        return Response.json(r.payload);
      },
    },
  },
});
