import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canWriteProjectFiles,getProjectAccess } from "@/lib/project/access";
import { readProjectContractFromFiles } from "@/lib/ai/project-contract";
import { constrainRepairFiles } from "@/lib/ai/project-contract-validate";

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
        const tokenPath = "src/styles/tokens.css";
        const { data: existingRows } = await supabase
          .from("project_files")
          .select("path, content, language")
          .eq("project_id", params.id);
        const existingFiles = (existingRows ?? []) as Array<{ path: string; content: string; language?: string }>;
        const constrained = constrainRepairFiles(
          [{ path: tokenPath, content: cssContent, language: "css" }],
          existingFiles,
          readProjectContractFromFiles(existingFiles),
          [tokenPath],
        );
        if (constrained.files.length === 0) {
          return Response.json({ error: "Design tokens are outside the project contract" }, { status: 400 });
        }
        let file = null;
        for (const row of constrained.files) {
          const { data, error } = await supabase.from("project_files").upsert(
            { project_id: params.id, path: row.path, content: row.content, language: row.language ?? "css" },
            { onConflict: "project_id,path" },
          ).select().single();
          if (error) return Response.json({ error: error.message }, { status: 500 });
          if (row.path === tokenPath) file = data;
        }
        return Response.json({ file });
      },
    },
  },
});
