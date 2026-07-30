import { createFileRoute } from "@tanstack/react-router";
import {
  createSnapshot,
  deleteSnapshot,
  listOrGetSnapshot,
  pinSnapshot,
} from "@/lib/server-fns/snapshots";

/** Native /api/projects/snapshots */
export const Route = createFileRoute("/api/projects/snapshots")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const result = await listOrGetSnapshot({
          data: {
            projectId: url.searchParams.get("projectId") ?? undefined,
            id: url.searchParams.get("id") ?? undefined,
          },
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "bad_request") {
          return Response.json({ error: result.error }, { status: 400 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        if (result.kind === "files") {
          return Response.json({ files: result.files });
        }
        return Response.json(result.snapshots);
      },
      POST: async ({ request }) => {
        let body: { projectId?: string; label?: string } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        if (!body.projectId) {
          return Response.json({ error: "projectId required" }, { status: 400 });
        }
        const result = await createSnapshot({
          data: { projectId: body.projectId, label: body.label },
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (result.status === "bad_request") {
          return Response.json({ error: result.error }, { status: 400 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json(result.snapshot, { status: 201 });
      },
      PATCH: async ({ request }) => {
        let body: { snapshotId?: string; isPinned?: boolean } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        if (!body.snapshotId) {
          return Response.json({ error: "snapshotId required" }, { status: 400 });
        }
        const result = await pinSnapshot({
          data: {
            snapshotId: body.snapshotId,
            isPinned: !!body.isPinned,
          },
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json(result.snapshot);
      },
      DELETE: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) {
          return Response.json({ error: "id required" }, { status: 400 });
        }
        const result = await deleteSnapshot({ data: { id } });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
