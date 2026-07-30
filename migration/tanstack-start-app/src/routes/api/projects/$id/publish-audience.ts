// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import {
  isPublishAudience,
  describePublishAudience,
  type PublishAudience,
} from "@/lib/project/publish-audience";
import { logger } from "@/lib/logger";

/**
 * /api/projects/:id/publish-audience — read and set who may view a published app.
 *
 * GET    → current audience, the grant list, and an accurate description of what is
 *          actually enforced.
 * PUT    → set the audience mode.
 * POST   → add a grant (group, user id, or external email).
 * DELETE → remove a grant.
 *
 * Owner-only throughout: deciding who can see a published app is not a collaborator
 * decision. Grants are validated before insert — an email that is not an email, or a
 * group that belongs to somebody else, is rejected rather than stored and silently
 * ignored at evaluation time.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const Route = createFileRoute("/api/projects/$id/publish-audience")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: project } = await supabase
          .from("projects")
          .select("id, user_id, publish_audience")
          .eq("id", params.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        const { data: grants } = await supabase
          .from("project_publish_grants")
          .select("id, group_id, user_id, email, is_external, created_at")
          .eq("project_id", params.id);

        const list = grants ?? [];
        const audience = (project.publish_audience ?? "public") as PublishAudience;

        return Response.json({
          audience,
          grants: list,
          externalCount: list.filter((g: { is_external?: boolean }) => g.is_external).length,
          description: describePublishAudience(
            audience,
            list.length,
            list.filter((g: { is_external?: boolean }) => g.is_external).length,
          ),
        });
      },

      PUT: async ({ request, params }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { audience } = await request.json().catch(() => ({}));
        if (!isPublishAudience(audience)) {
          return Response.json(
            { error: "audience must be one of public, workspace, private, custom" },
            { status: 400 },
          );
        }

        const { data: project } = await supabase
          .from("projects")
          .select("id")
          .eq("id", params.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        const { error } = await supabase
          .from("projects")
          .update({ publish_audience: audience })
          .eq("id", params.id)
          .eq("user_id", user.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const { count } = await supabase
          .from("project_publish_grants")
          .select("*", { count: "exact", head: true })
          .eq("project_id", params.id);

        logger.info("project.publish_audience.set", { projectId: params.id, audience });

        return Response.json({
          ok: true,
          audience,
          description: describePublishAudience(audience, count ?? 0),
          // Said plainly: selecting `custom` with an empty list is the same as
          // private, and a user who does not know that will think they published.
          ...(audience === "custom" && !count
            ? { warning: "No one has been added yet, so only you can view the app." }
            : {}),
        });
      },

      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json().catch(() => ({}));
        const { groupId, userId, email } = body as {
          groupId?: string;
          userId?: string;
          email?: string;
        };

        const provided = [groupId, userId, email].filter(Boolean).length;
        if (provided !== 1) {
          return Response.json(
            { error: "Provide exactly one of groupId, userId or email." },
            { status: 400 },
          );
        }

        const { data: project } = await supabase
          .from("projects")
          .select("id, user_id")
          .eq("id", params.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        // Validate before inserting. A grant that can never match is worse than a
        // rejected one: it sits in the list looking like access somebody has.
        let isExternal = false;

        if (email) {
          const normalized = email.trim().toLowerCase();
          if (!EMAIL_RE.test(normalized)) {
            return Response.json({ error: "That is not a valid email address." }, { status: 400 });
          }
          // External unless the address belongs to an existing platform user.
          const { data: existing } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", normalized)
            .maybeSingle();
          isExternal = !existing;

          const { error } = await supabase.from("project_publish_grants").insert({
            project_id: params.id,
            email: normalized,
            is_external: isExternal,
            created_by: user.id,
          });
          if (error) {
            return Response.json(
              { error: error.message.includes("duplicate") ? "That email already has access." : error.message },
              { status: 400 },
            );
          }
        }

        if (groupId) {
          // The group must be the owner's own, or one workspace could grant access
          // using another workspace's group id.
          const { data: group } = await supabase
            .from("member_groups")
            .select("id")
            .eq("id", groupId)
            .maybeSingle();
          if (!group) {
            return Response.json({ error: "Group not found." }, { status: 404 });
          }
          const { error } = await supabase.from("project_publish_grants").insert({
            project_id: params.id,
            group_id: groupId,
            created_by: user.id,
          });
          if (error) return Response.json({ error: error.message }, { status: 400 });
        }

        if (userId) {
          const { data: target } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", userId)
            .maybeSingle();
          if (!target) {
            return Response.json({ error: "User not found." }, { status: 404 });
          }
          const { error } = await supabase.from("project_publish_grants").insert({
            project_id: params.id,
            user_id: userId,
            created_by: user.id,
          });
          if (error) return Response.json({ error: error.message }, { status: 400 });
        }

        logger.info("project.publish_grant.added", {
          projectId: params.id,
          kind: email ? "email" : groupId ? "group" : "user",
          isExternal,
        });

        return Response.json({ ok: true, isExternal });
      },

      DELETE: async ({ request, params }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const grantId = new URL(request.url).searchParams.get("grantId");
        if (!grantId) return Response.json({ error: "grantId required" }, { status: 400 });

        const { data: project } = await supabase
          .from("projects")
          .select("id")
          .eq("id", params.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        await supabase
          .from("project_publish_grants")
          .delete()
          .eq("id", grantId)
          .eq("project_id", params.id);

        return Response.json({ ok: true });
      },
    },
  },
});
