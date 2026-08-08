import { createFileRoute } from "@tanstack/react-router";
import { getProjectDomain,setProjectDomain,deleteProjectDomain } from "@/lib/server-fns/domains";

const unauth = () => Response.json({ error: "Unauthorized" }, { status: 401 });

/** Native /api/domains — GET/POST/DELETE custom domain for a project. */
export const Route = createFileRoute("/api/domains")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
        const r = await getProjectDomain({ projectId });
        if (r.status === "unauthorized") return unauth();
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        if (r.status === "not_found") return Response.json({ error: "Not found" }, { status: 404 });
        return Response.json({ customDomain: r.customDomain, deployedUrl: r.deployedUrl });
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { projectId?: string; domain?: string };
        const r = await setProjectDomain({ projectId: body.projectId ?? "", domain: body.domain ?? "" });
        if (r.status === "unauthorized") return unauth();
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        if (r.status === "not_found") return Response.json({ error: "Project not found" }, { status: 404 });
        // The attach failed. 502 rather than 500: the fault is upstream at the
        // hosting provider (or in our configuration of it), not in the request.
        // Without this branch the new status fell through to `r.payload`, which
        // is undefined on that path — the client would have received `null`
        // with a 200 and shown a success toast for a domain that was never
        // attached, which is the exact failure this change exists to end.
        if (r.status === "hosting_error") return Response.json({ error: r.message }, { status: 502 });
        if (r.status === "database_error") return Response.json({ error: r.message }, { status: 500 });
        return Response.json(r.payload);
      },
      DELETE: async ({ request }) => {
        const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
        const r = await deleteProjectDomain({ projectId });
        if (r.status === "unauthorized") return unauth();
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        if (r.status === "database_error") return Response.json({ error: r.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
