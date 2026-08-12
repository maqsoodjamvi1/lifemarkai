import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/projects/:id/import-files — copy selected files from a source
 * project into this one (owner/editor on target, read access on source).
 */
export const Route = createFileRoute("/api/projects/$id/import-files")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const { sourceProjectId, filePaths } = body;

        if (!sourceProjectId || typeof sourceProjectId !== "string") {
          return Response.json({ error: "sourceProjectId required" }, { status: 400 });
        }
        if (!Array.isArray(filePaths) || filePaths.length === 0) {
          return Response.json({ error: "filePaths must be a non-empty array" }, { status: 400 });
        }
        if (filePaths.length > 20) return Response.json({ error: "Max 20 files per import" }, { status: 400 });

        const targetProjectId = id;

        const { data: targetProject } = await supabase
          .from("projects").select("id, user_id").eq("id", targetProjectId).single();
        if (!targetProject) return Response.json({ error: "Target project not found" }, { status: 404 });

        const canWriteTarget =
          targetProject.user_id === user.id ||
          (await supabase
            .from("collaborators")
            .select("role")
            .eq("project_id", targetProjectId)
            .eq("user_id", user.id)
            .in("role", ["owner", "editor"])
            .maybeSingle()
          ).data != null;
        if (!canWriteTarget) return Response.json({ error: "No write access to target project" }, { status: 403 });

        const { data: sourceProject } = await supabase
          .from("projects").select("id, user_id, is_public").eq("id", sourceProjectId).single();
        if (!sourceProject) return Response.json({ error: "Source project not found" }, { status: 404 });

        const canReadSource =
          sourceProject.user_id === user.id ||
          sourceProject.is_public === true ||
          (await supabase
            .from("collaborators")
            .select("id")
            .eq("project_id", sourceProjectId)
            .eq("user_id", user.id)
            .maybeSingle()
          ).data != null;
        if (!canReadSource) return Response.json({ error: "No read access to source project" }, { status: 403 });

        const { data: sourceFiles, error: fetchErr } = await supabase
          .from("project_files")
          .select("path, content, language")
          .eq("project_id", sourceProjectId)
          .in("path", filePaths);

        if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 });
        if (!sourceFiles || sourceFiles.length === 0) {
          return Response.json({ error: "No matching files found in source project" }, { status: 404 });
        }

        const toInsert = sourceFiles.map((f: { path: string; content: string; language: string }) => ({
          project_id: targetProjectId,
          path: f.path,
          content: f.content,
          language: f.language,
        }));

        const { data: imported, error: upsertErr } = await supabase
          .from("project_files")
          .upsert(toInsert, { onConflict: "project_id,path" })
          .select();

        if (upsertErr) return Response.json({ error: upsertErr.message }, { status: 500 });

        return Response.json({ imported, count: imported?.length ?? 0 });
      },
    },
  },
});
