import { createFileRoute } from "@tanstack/react-router";
import { restoreSnapshot } from "@/lib/server-fns/snapshots";

/** Native /api/projects/snapshots/restore */
export const Route = createFileRoute("/api/projects/snapshots/restore")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          snapshotId?: string;
          projectId?: string;
          dryRun?: boolean;
          confirmSchema?: boolean;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        if (!body.snapshotId || !body.projectId) {
          return Response.json(
            { error: "snapshotId and projectId required" },
            { status: 400 },
          );
        }
        const result = await restoreSnapshot({
            snapshotId: body.snapshotId,
            projectId: body.projectId,
            dryRun: body.dryRun === true,
            confirmSchema: body.confirmSchema === true,
          });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json(
            { error: result.error ?? "Not found" },
            { status: 404 },
          );
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        if (result.status === "needs_confirm") {
          return Response.json(
            {
              ok: false,
              requiresConfirmation: true,
              schemaChanges: result.schemaChanges,
              message: result.message,
            },
            { status: 409 },
          );
        }
        if (result.kind === "dry_run") {
          return Response.json({
            ok: true,
            dryRun: true,
            schemaChanges: result.schemaChanges,
            hasSchemaChanges: result.hasSchemaChanges,
            filesToChange: result.filesToChange,
            snapshotLabel: result.snapshotLabel,
          });
        }
        return Response.json({
          ok: true,
          files: result.files,
          message: result.message,
        });
      },
    },
  },
});
