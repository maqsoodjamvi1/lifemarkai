import { createFileRoute } from "@tanstack/react-router";
import { deleteEnvVar, listEnvKeys, upsertEnvVar } from "@/lib/server-fns/env";

/** Native /api/projects/:id/env — keys masked on GET. */
export const Route = createFileRoute("/api/projects/$id/env")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await listEnvKeys({ projectId: params.id });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Project not found" }, { status: 404 });
        }
        return Response.json({ envVars: result.envVars });
      },
      POST: async ({ request, params }) => {
        let body: { key?: string; value?: string } = {};
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        if (!body.key?.trim()) {
          return Response.json({ error: "key is required" }, { status: 400 });
        }
        if (body.value === undefined) {
          return Response.json({ error: "value is required" }, { status: 400 });
        }
        const result = await upsertEnvVar({
          projectId: params.id,
          key: body.key,
          value: String(body.value),
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Project not found" }, { status: 404 });
        }
        return Response.json({ ok: true, key: result.key });
      },
      DELETE: async ({ request, params }) => {
        let body: { key?: string } = {};
        try {
          body = await request.json();
        } catch {
          const url = new URL(request.url);
          body = { key: url.searchParams.get("key") ?? undefined };
        }
        if (!body.key?.trim()) {
          return Response.json({ error: "key is required" }, { status: 400 });
        }
        const result = await deleteEnvVar({
          projectId: params.id,
          key: body.key,
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Project not found" }, { status: 404 });
        }
        return Response.json({ ok: true, key: result.key, deleted: result.deleted });
      },
    },
  },
});
