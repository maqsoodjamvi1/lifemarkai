import { createFileRoute } from "@tanstack/react-router";
import {
  deleteProjectFile,
  listProjectFiles,
  patchProjectFile,
  upsertProjectFile,
} from "@/lib/server-fns/project-files";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Native /api/projects/:id/files — editor hot path. */
export const Route = createFileRoute("/api/projects/$id/files")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!UUID_RE.test(params.id)) {
          return Response.json({ error: "Invalid project id" }, { status: 400 });
        }
        const result = await listProjectFiles(params.id);
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Project not found" }, { status: 404 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json(result.files);
      },
      POST: async ({ request, params }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        if (!UUID_RE.test(params.id)) {
          return Response.json({ error: "Invalid project id" }, { status: 400 });
        }
        if (!body.path || typeof body.path !== "string") {
          return Response.json({ error: "path is required" }, { status: 400 });
        }
        const result = await upsertProjectFile({
          projectId: params.id,
          path: body.path,
          content: typeof body.content === "string" ? body.content : "",
          language: typeof body.language === "string" ? body.language : "plaintext",
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Project not found" }, { status: 404 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json(result.file, { status: 201 });
      },
      PATCH: async ({ request, params }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        if (!UUID_RE.test(params.id)) {
          return Response.json({ error: "Invalid project id" }, { status: 400 });
        }
        if (!body.fileId || typeof body.fileId !== "string" || !UUID_RE.test(body.fileId)) {
          return Response.json({ error: "fileId is required" }, { status: 400 });
        }
        const result = await patchProjectFile({
          projectId: params.id,
          fileId: body.fileId,
          content: typeof body.content === "string" ? body.content : undefined,
          path: typeof body.path === "string" ? body.path : undefined,
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Project not found" }, { status: 404 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json(result.file);
      },
      DELETE: async ({ request, params }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        if (!UUID_RE.test(params.id)) {
          return Response.json({ error: "Invalid project id" }, { status: 400 });
        }
        if (!body.fileId || typeof body.fileId !== "string" || !UUID_RE.test(body.fileId)) {
          return Response.json({ error: "fileId is required" }, { status: 400 });
        }
        const result = await deleteProjectFile({
          projectId: params.id,
          fileId: body.fileId,
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Project not found" }, { status: 404 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json({ success: true });
      },
    },
  },
});
