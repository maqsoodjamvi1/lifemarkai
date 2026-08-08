import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { parseSnapshotChain,reconstructFromChain } from "@/lib/diff/snapshot-diff";
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

        const { data: deployment } = await supabase
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

        const { data: chain, error: chainError } = await supabase
          .rpc("get_snapshot_chain", { p_snapshot_id: deployment.snapshot_id });
        if (chainError) return Response.json({ error: chainError.message }, { status: 500 });

        const entries = parseSnapshotChain(chain ?? []);
        const restoredFiles = reconstructFromChain(entries);
        if (restoredFiles.length === 0) {
          return Response.json({ error: "Snapshot is empty — nothing to restore." }, { status: 400 });
        }

        const { data: currentFiles } = await supabase
          .from("project_files")
          .select("path, content, language")
          .eq("project_id", projectId);

        // ── The most destructive few lines in this route ──────────────────
        //
        // Below, a delete loop removes every current file the snapshot does
        // not contain. None of the three write phases used to check its
        // result, and line 91 returned `{ ok: true }` regardless — so if the
        // upserts failed (RLS, a constraint, a quota) while the deletes
        // succeeded, the project ended up with FEWER files than it started
        // with, or with none at all when the snapshot's paths differ from the
        // current ones, and the panel toasted "Rolled back! Restored N files."
        //
        // `restoreSnapshot` in server-fns/snapshots.ts was hardened against
        // exactly this. This is its unhardened twin; it just wasn't found at
        // the same time.

        // 1. Safety net FIRST, and refuse to continue without it. Everything
        //    after this point can lose data, and this row is the only way
        //    back. Proceeding when it fails is how a recovery message ends up
        //    pointing at a version that does not exist.
        if (currentFiles && currentFiles.length > 0) {
          const { error: safetyError } = await supabase
            .from("project_snapshots")
            .insert({
              project_id: projectId,
              user_id: user.id,
              label: `Before rollback to deploy ${deploymentId.slice(0, 8)}`,
              is_baseline: true,
              files: currentFiles,
              patches: null,
              parent_id: null,
            });
          if (safetyError) {
            logger.error(
              "deploy.rollback.safety_snapshot_failed",
              new Error(safetyError.message ?? String(safetyError)),
              { projectId, deploymentId, userId: user.id },
            );
            return Response.json(
              {
                error:
                  "Could not save a restore point for your current files, so the rollback was not started. Nothing has changed. Try again in a moment.",
              },
              { status: 500 },
            );
          }
        }

        // 2. Write the snapshot's files. A single failure aborts BEFORE the
        //    delete phase — a half-restored project that still has its own
        //    files is recoverable; a half-restored project with the rest
        //    deleted is not.
        for (const file of restoredFiles) {
          const { error: upsertError } = await supabase
            .from("project_files")
            .upsert({
              project_id: projectId,
              path: file.path,
              content: file.content,
              language: file.language ?? "plaintext",
            }, { onConflict: "project_id,path" });
          if (upsertError) {
            logger.error(
              "deploy.rollback.restore_write_failed",
              new Error(upsertError.message ?? String(upsertError)),
              { projectId, deploymentId, path: file.path },
            );
            return Response.json(
              {
                error: `Rollback stopped part-way while writing ${file.path}. Nothing was deleted, and your files before the rollback are saved in version history as "Before rollback to deploy ${deploymentId.slice(0, 8)}".`,
              },
              { status: 500 },
            );
          }
        }

        // 3. Only now remove what the snapshot does not have. A failure here
        //    leaves extra files behind, which is untidy rather than
        //    destructive — so report it without failing the rollback.
        const restoredPaths = new Set(restoredFiles.map((file) => file.path));
        const notRemoved: string[] = [];
        if (currentFiles) {
          const typedCurrentFiles = currentFiles as Array<{ path: string }>;
          const toDelete = typedCurrentFiles.filter((file) => !restoredPaths.has(file.path));
          for (const f of toDelete) {
            const { error: deleteError } = await supabase.from("project_files")
              .delete()
              .eq("project_id", projectId)
              .eq("path", f.path);
            if (deleteError) notRemoved.push(f.path);
          }
        }
        if (notRemoved.length > 0) {
          logger.warn("deploy.rollback.stale_files_remain", {
            projectId,
            deploymentId,
            count: notRemoved.length,
            paths: notRemoved.slice(0, 10),
          });
        }

        logger.info("deploy.rollback", { projectId, deploymentId, fileCount: restoredFiles.length, userId: user.id });

        return Response.json({
          ok: true,
          fileCount: restoredFiles.length,
          deployUrl: deployment.url,
          // The panel can tell the user their project is back but not clean,
          // rather than showing an unqualified success.
          staleFilesRemaining: notRemoved.length || undefined,
        });
      },
    },
  },
});
