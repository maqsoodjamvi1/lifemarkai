import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import {
evaluatePublishAudience,
type PublishAudience,
} from "@/lib/project/publish-audience";
import { logger } from "@/lib/logger";

/**
 * GET /api/embed/access?projectId=… — may the caller view this published app?
 *
 * THE ENFORCEMENT POINT. `publish_audience` and `project_publish_grants` are useless
 * without something that reads them, and shipping the tables plus a settings route
 * without this would have reproduced the exact bug being fixed: a control that
 * appears to work and changes nothing.
 *
 * Returns 200 { allowed: true } or 403 { allowed: false, message }. The message never
 * names who IS on the allowlist — a denial that leaks the guest list is its own
 * disclosure.
 *
 * FAILS CLOSED. Any error determining the audience denies access. The download policy
 * fails open because it guards source code and a false denial is the bigger harm
 * there; here a false ALLOW publishes someone's internal app to the internet, so the
 * asymmetry runs the other way.
 */
export const Route = createFileRoute("/api/embed/access")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const projectId = new URL(request.url).searchParams.get("projectId");
        if (!projectId) {
          return Response.json({ allowed: false, message: "projectId required" }, { status: 400 });
        }

        try {
          const supabase = await createClient();
          // The viewer may well be anonymous; that is a valid state, not an error.
          const { data: { user } } = await supabase.auth.getUser();

          const { data: project } = await supabase
            .from("projects")
            .select("id, user_id, publish_audience")
            .eq("id", projectId)
            .maybeSingle();

          if (!project) {
            // Do not distinguish "no such project" from "not allowed" to an
            // anonymous caller — that difference is an enumeration oracle.
            return Response.json(
              { allowed: false, message: "You do not have access to this app." },
              { status: 403 },
            );
          }

          const audience = (project.publish_audience ?? "public") as PublishAudience;

          // Short-circuit the common case before any further lookups.
          if (audience === "public") {
            return Response.json({ allowed: true, audience });
          }

          let workspaceOwnerId: string | null = null;
          let groupIds: string[] = [];
          let email: string | null = null;

          if (user) {
            email = (user.email as string | undefined) ?? null;

            // Workspace membership: a collaborator on any of the owner's projects
            // counts as a workspace member for viewing purposes.
            const { data: collab } = await supabase
              .from("collaborators")
              .select("project_id")
              .eq("user_id", user.id)
              .eq("project_id", projectId)
              .maybeSingle();
            if (collab) workspaceOwnerId = project.user_id;

            if (audience === "custom") {
              // Column is `member_id`, not `user_id` (migration 051). It references
              // auth.users directly, so user.id is the right value — but querying
              // the wrong column name would have returned zero groups and silently
              // denied every group-based grant.
              const { data: memberships } = await supabase
                .from("member_group_members")
                .select("group_id")
                .eq("member_id", user.id);
              groupIds = (memberships ?? []).map((m: { group_id: string }) => m.group_id);
            }
          }

          const grants =
            audience === "custom"
              ? (
                  await supabase
                    .from("project_publish_grants")
                    .select("group_id, user_id, email, is_external")
                    .eq("project_id", projectId)
                ).data ?? []
              : [];

          const decision = evaluatePublishAudience({
            audience,
            ownerId: project.user_id,
            viewer: { userId: user?.id ?? null, email, workspaceOwnerId, groupIds },
            grants,
          });

          if (!decision.allowed) {
            logger.info("embed.access.denied", {
              projectId,
              audience,
              reason: decision.reason,
              anonymous: !user,
            });
            return Response.json(
              { allowed: false, reason: decision.reason, message: decision.message },
              { status: 403 },
            );
          }

          return Response.json({ allowed: true, audience, reason: decision.reason });
        } catch (e) {
          logger.error("embed.access.failed", { projectId, error: String(e) });
          return Response.json(
            { allowed: false, message: "Access could not be verified." },
            { status: 403 },
          );
        }
      },
    },
  },
});
