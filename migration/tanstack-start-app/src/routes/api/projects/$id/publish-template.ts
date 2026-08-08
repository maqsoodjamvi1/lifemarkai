import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/projects/:id/publish-template — publish (or re-publish) a project
 * as a community template. GET reports whether it's already published.
 */
const VALID_CATEGORIES = [
  "landing", "dashboard", "ecommerce", "saas", "portfolio",
  "blog", "tool", "ai", "social", "other",
];

export const Route = createFileRoute("/api/projects/$id/publish-template")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: project } = await supabase
          .from("projects")
          .select("id, user_id, name, description, framework, preview_url, is_public")
          .eq("id", id)
          .single();

        if (!project) return Response.json({ error: "Not found" }, { status: 404 });
        if (project.user_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });

        const { data: files } = await supabase
          .from("project_files")
          .select("path, content, language")
          .eq("project_id", id)
          .order("path");

        if (!files || files.length === 0) {
          return Response.json({ error: "Project has no files to publish." }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));

        const name: string = (body.name ?? project.name ?? "Untitled").trim().slice(0, 80);
        const description: string = (body.description ?? project.description ?? "").trim().slice(0, 500);
        const category: string = VALID_CATEGORIES.includes(body.category) ? body.category : "other";
        const preview_url: string | null = body.preview_url ?? project.preview_url ?? null;

        if (!name) return Response.json({ error: "Template name is required." }, { status: 400 });

        const templateFiles = (files as Array<{ path: string; content: string; language: string }>).map((f) => ({
          path: f.path,
          content: f.content ?? "",
          language: f.language ?? "plaintext",
        }));

        const { data: existing } = await supabase
          .from("templates")
          .select("id")
          .eq("created_by", user.id)
          .eq("source_project_id", id)
          .maybeSingle();

        const payload = { name, description, category, preview_url, files: templateFiles, is_public: true };

        const { data: template, error } = existing
          ? await supabase
              .from("templates")
              .update(payload)
              .eq("id", existing.id)
              .select("id, name, category, is_public, fork_count, created_at")
              .single()
          : await supabase
              .from("templates")
              .insert({ ...payload, is_featured: false, created_by: user.id, source_project_id: id })
              .select("id, name, category, is_public, fork_count, created_at")
              .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json(template, { status: existing ? 200 : 201 });
      },

      GET: async ({ params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: project } = await supabase
          .from("projects").select("user_id").eq("id", id).single();
        if (!project || project.user_id !== user.id) return Response.json({ published: false });

        const { data: existing } = await supabase
          .from("templates")
          .select("id, name, fork_count, created_at")
          .eq("created_by", user.id)
          .eq("source_project_id", id)
          .maybeSingle();

        return Response.json({ published: !!existing, template: existing ?? null });
      },
    },
  },
});
