// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";

/** Native /api/projects/:id/design-system — POST upsert src/styles/tokens.css. */
export const Route = createFileRoute("/api/projects/$id/design-system")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { cssContent } = await request.json().catch(() => ({}));
        if (!cssContent || typeof cssContent !== "string") return Response.json({ error: "Missing cssContent" }, { status: 400 });
        const access = await getProjectAccess(supabase, params.id, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });
        const { data: file, error } = await (supabase as any).from("project_files").upsert(
          { project_id: params.id, path: "src/styles/tokens.css", content: cssContent, language: "css" },
          { onConflict: "project_id,path" },
        ).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ file });
      },
    },
  },
});
