import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import {
deleteManagedProject,
isManagementConfigured,
} from "@/lib/cloud/management";
import { logger } from "@/lib/logger";

/**
 * POST /api/cloud/remove — permanently remove Lovable-Cloud-style managed backend
 * from a project.
 *
 * WHY THIS ROUTE EXISTS. `deleteManagedProject()` had been written, was correct,
 * and had ZERO call sites anywhere in the repo. Dead code that reads as a feature
 * is its own kind of lie: the function's presence implied "we can remove Cloud",
 * and nothing could. The alternative was deleting it, but removing Cloud from a
 * project is a real capability (Lovable shipped "Remove Lovable Cloud" on 3 July)
 * and the export path it pairs with already exists — so wiring it is the better
 * resolution.
 *
 * THIS IS IRREVERSIBLE AND IT DELETES A DATABASE. Guardrails, all mandatory:
 *
 *   1. Ownership — the project must belong to the caller (not merely be visible).
 *   2. Typed confirmation — `confirm` must exactly equal the project's name. A
 *      boolean flag is too easy to send by accident from a script or a mis-wired
 *      button.
 *   3. Explicit data-loss acknowledgement — `acknowledgeDataLoss: true`, separate
 *      from the name, so one field cannot satisfy both checks.
 *   4. Export nudge — the response tells the caller when no export was ever taken.
 *      Set `skipExportCheck: true` to proceed anyway; we refuse by default rather
 *      than deleting data the user has no copy of.
 *
 * The local flags are cleared only AFTER the remote delete succeeds (or when there
 * is nothing remote to delete). Clearing first would strand a live paid instance
 * with no record in our database that it exists — the worst possible failure here,
 * because the user keeps being billed for something they can no longer see.
 */
export const Route = createFileRoute("/api/cloud/remove")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json().catch(() => ({}));
        const {
          projectId,
          confirm,
          acknowledgeDataLoss = false,
          skipExportCheck = false,
        } = body as {
          projectId?: string;
          confirm?: string;
          acknowledgeDataLoss?: boolean;
          skipExportCheck?: boolean;
        };

        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

        const { data: project } = await supabase
          .from("projects")
          .select("id, name, cloud_enabled, cloud_project_ref, cloud_status")
          .eq("id", projectId)
          .eq("user_id", user.id)
          .single();

        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
        if (!project.cloud_enabled) {
          return Response.json({ error: "Cloud is not enabled for this project" }, { status: 400 });
        }

        // Guardrail 2 — typed name.
        if (typeof confirm !== "string" || confirm.trim() !== String(project.name).trim()) {
          return Response.json(
            {
              error: "Type the project name exactly to confirm removal.",
              requiresConfirmation: true,
              expected: project.name,
            },
            { status: 428 },
          );
        }

        // Guardrail 3 — separate, explicit acknowledgement.
        if (acknowledgeDataLoss !== true) {
          return Response.json(
            {
              error:
                "Removing Cloud permanently deletes the database, auth users, storage objects and edge functions for this project. Set acknowledgeDataLoss to proceed.",
              requiresConfirmation: true,
            },
            { status: 428 },
          );
        }

        // Guardrail 4 — refuse by default when there is no export on record.
        if (!skipExportCheck) {
          const { count } = await supabase
            .from("lifemark_cloud_auto_backups")
            .select("*", { count: "exact", head: true })
            .eq("project_id", projectId);
          if (!count) {
            return Response.json(
              {
                error:
                  "No backup or export is on record for this project. Export the data first, or resend with skipExportCheck to delete it anyway.",
                requiresExport: true,
              },
              { status: 428 },
            );
          }
        }

        // Remote delete FIRST. A local-mode project (no ref, or no Management API
        // credentials) has no remote resource, so there is nothing to delete and we
        // fall through to clearing the flags.
        if (project.cloud_project_ref && isManagementConfigured()) {
          const deleted = await deleteManagedProject(project.cloud_project_ref);
          if (!deleted) {
            logger.warn("cloud.remove.remote_delete_failed", {
              projectId,
              ref: project.cloud_project_ref,
            });
            return Response.json(
              {
                error:
                  "Could not delete the managed backend upstream. Nothing has been changed — retry, or contact support before the instance keeps billing.",
              },
              { status: 502 },
            );
          }
        }

        const { error: updateError } = await supabase
          .from("projects")
          .update({
            cloud_enabled: false,
            cloud_status: "removed",
            cloud_project_ref: null,
            cloud_supabase_url: null,
            cloud_anon_key: null,
            cloud_provisioned_at: null,
          })
          .eq("id", projectId)
          .eq("user_id", user.id);

        if (updateError) {
          // The remote instance is gone but our row still claims it exists. Say so
          // rather than reporting success — a stale ref pointing at a deleted
          // project is a confusing state the user should know about.
          logger.error("cloud.remove.local_clear_failed", { projectId, error: updateError.message });
          return Response.json(
            {
              error:
                "The managed backend was deleted, but this project's Cloud settings could not be cleared. Reload and retry.",
            },
            { status: 500 },
          );
        }

        logger.info("cloud.remove.completed", { projectId, userId: user.id });
        return Response.json({
          ok: true,
          removed: true,
          message: "Lifemark Cloud has been removed and its data permanently deleted.",
        });
      },
    },
  },
});
