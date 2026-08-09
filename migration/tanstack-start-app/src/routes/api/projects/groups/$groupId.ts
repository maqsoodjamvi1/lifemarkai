import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { getServerUser } from "@/lib/supabase/server-user";

/** Native /api/projects/groups/:groupId — rename/recolor/reparent or delete a folder. */
const MAX_FOLDER_DEPTH = 2;

async function folderDepth(supabase: any, groupId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = groupId;
  while (currentId && depth <= MAX_FOLDER_DEPTH + 1) {
    const { data } = await supabase
      .from("project_groups").select("parent_id").eq("id", currentId).single();
    if (!data?.parent_id) break;
    currentId = data.parent_id as string;
    depth++;
  }
  return depth;
}

export const Route = createFileRoute("/api/projects/groups/$groupId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const { groupId } = params;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const updates: Database["public"]["Tables"]["project_groups"]["Update"] = {};
        if (typeof body.name === "string") updates.name = body.name.trim();
        if (typeof body.color === "string") updates.color = body.color;
        if (typeof body.position === "number") updates.position = body.position;
        if (body.parent_id === null) updates.parent_id = null;
        if (typeof body.parent_id === "string") {
          if (body.parent_id === groupId) {
            return Response.json({ error: "A folder cannot be its own parent" }, { status: 400 });
          }
          const { data: parent } = await supabase
            .from("project_groups").select("id").eq("id", body.parent_id).eq("user_id", user.id).single();
          if (!parent) return Response.json({ error: "Parent folder not found" }, { status: 404 });
          const parentDepth = await folderDepth(supabase, body.parent_id);
          if (parentDepth >= MAX_FOLDER_DEPTH) {
            return Response.json({ error: "Maximum folder depth (3 levels) reached" }, { status: 400 });
          }
          updates.parent_id = body.parent_id;
        }

        if (Object.keys(updates).length === 0) {
          return Response.json({ error: "Nothing to update" }, { status: 400 });
        }

        const { data, error } = await supabase
          .from("project_groups")
          .update(updates)
          .eq("id", groupId)
          .eq("user_id", user.id)
          .select()
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json(data);
      },

      DELETE: async ({ params }) => {
        const { groupId } = params;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { error } = await supabase
          .from("project_groups")
          .delete()
          .eq("id", groupId)
          .eq("user_id", user.id);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      },
    },
  },
});
