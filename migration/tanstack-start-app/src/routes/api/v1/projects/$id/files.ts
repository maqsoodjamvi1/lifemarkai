// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateApiRequest } from "@/lib/api/api-key";

/**
 * Native /api/v1/projects/:id/files — public API project files.
 *   GET               → list files (path, language, size)
 *   GET ?path=x.tsx   → single file with full content
 *   Scope: projects:read
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const Route = createFileRoute("/api/v1/projects/$id/files")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request, "projects:read");
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: CORS });

        const { id } = params;
        const supabase = createAdminClient();

        // Ownership check (admin client bypasses RLS, so verify explicitly).
        const { data: project } = await supabase
          .from("projects").select("id").eq("id", id).eq("user_id", auth.userId).single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404, headers: CORS });

        const wantPath = new URL(request.url).searchParams.get("path");

        if (wantPath) {
          const { data: file } = await supabase
            .from("project_files")
            .select("path, content, language")
            .eq("project_id", id)
            .eq("path", wantPath)
            .single();
          if (!file) return Response.json({ error: "File not found" }, { status: 404, headers: CORS });
          return Response.json({ file }, { headers: CORS });
        }

        const { data: files, error } = await supabase
          .from("project_files")
          .select("path, language, content")
          .eq("project_id", id)
          .order("path");
        if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS });

        const list = (files ?? []).map((f: { path: string; language: string | null; content: string | null }) => ({
          path: f.path,
          language: f.language,
          size: (f.content ?? "").length,
        }));
        return Response.json({ files: list, count: list.length }, { headers: CORS });
      },
    },
  },
});
