// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/projects/:id/group — PATCH assign/unassign project to a group. */
export const Route = createFileRoute("/api/projects/$id/group")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = await request.json().catch(() => ({}));
        const groupId = body.groupId ?? null;

        const { data: project } = await (supabase as any).from("projects").select("id, user_id").eq("id", params.id).single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
        if (project.user_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });

        if (groupId) {
          const { data: group } = await (supabase as any).from("project_groups").select("id").eq("id", groupId).eq("user_id", user.id).single();
          if (!group) return Response.json({ error: "Group not found" }, { status: 404 });
        }

        const { data, error } = await (supabase as any).from("projects").update({ group_id: groupId }).eq("id", params.id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json(data);
      },
    },
  },
});
