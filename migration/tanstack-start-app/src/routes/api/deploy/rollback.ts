// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { reconstructFromChain, type SnapshotChainEntry } from "@/lib/diff/snapshot-diff";
import { logger } from "@/lib/logger";

/**
 * Native /api/deploy/rollback — restore project files to a deployment's snapshot.
 * POST { projectId, deploymentId }.
 */
export const Route = createFileRoute("/api/deploy/rollback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { projectId, deploymentId } = (await request.json()) as { projectId: string; deploymentId: string };
        if (!projectId || !deploymentId) {
          return Response.json({ error: "projectId and deploymentId required" }, { status: 400 });
        }

        const { data: deployment } = await (supabase as any)
          .from("deployments")
          .select("id, snapshot_id, url, user_id, project_id")
          .eq("id", deploymentId)
          .eq("project_id", projectId)
          .single();

        if (!deployment || deployment.user_id !== user.id) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (!deployment.snapshot_id) {
          return Response.json(
            { error: "This deployment has no snapshot attached. Rollback is not available." },
            { status: 400 },
          );
        }

        const { data: chain, error: chainError } = await (supabase as any)
          .rpc("get_snapshot_chain", { p_snapshot_id: deployment.snapshot_id });
        if (chainError) return Response.json({ error: chainError.message }, { status: 500 });

        const entries = (chain ?? []) as SnapshotChainEntry[];
        const restoredFiles = reconstructFromChain(entries);
        if (restoredFiles.length === 0) {
          return Response.json({ error: "Snapshot is empty — nothing to restore." }, { status: 400 });
        }

        const { data: currentFiles } = await (supabase as any)
          .from("project_files")
          .select("path, content, language")
          .eq("project_id", projectId);

        if (currentFiles && currentFiles.length > 0) {
          await (supabase as any).from("project_snapshots").insert({
            project_id: projectId,
            user_id: user.id,
            label: `Before rollback to deploy ${deploymentId.slice(0, 8)}`,
            is_baseline: true,
            files: currentFiles,
            patches: null,
            parent_id: null,
          });
        }

        for (const file of restoredFiles) {
          await (supabase as any).from("project_files").upsert({
            project_id: projectId,
            path: file.path,
            content: file.content,
            language: file.language ?? "plaintext",
          }, { onConflict: "project_id,path" });
        }

        const restoredPaths = new Set(restoredFiles.map((f) => f.path));
        if (currentFiles) {
          const toDelete = currentFiles.filter((f) => !restoredPaths.has(f.path));
          for (const f of toDelete) {
            await (supabase as any).from("project_files")
              .delete()
              .eq("project_id", projectId)
              .eq("path", f.path);
          }
        }

        logger.info("deploy.rollback", { projectId, deploymentId, fileCount: restoredFiles.length, userId: user.id });

        return Response.json({ ok: true, fileCount: restoredFiles.length, deployUrl: deployment.url });
      },
    },
  },
});
