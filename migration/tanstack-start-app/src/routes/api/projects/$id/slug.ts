// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** Native /api/projects/:id/slug — GET availability check, PATCH set/clear vanity slug. */
export const Route = createFileRoute("/api/projects/$id/slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const slug = new URL(request.url).searchParams.get("check");
        if (!slug) return Response.json({ error: "check param required" }, { status: 400 });
        if (!SLUG_RE.test(slug)) return Response.json({ available: false, reason: "Invalid format. Use 3-40 lowercase letters, numbers, or hyphens." });
        const { data: existing } = await (supabase as any).from("projects").select("id").eq("app_slug", slug).neq("id", params.id).maybeSingle();
        return Response.json({ available: !existing });
      },
      PATCH: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: project } = await (supabase as any).from("projects").select("id, user_id").eq("id", params.id).single();
        if (!project) return Response.json({ error: "Not found" }, { status: 404 });
        if (project.user_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });
        const body = await request.json().catch(() => ({}));
        const slug: string | null = body.app_slug ?? null;
        if (slug !== null && !SLUG_RE.test(slug)) return Response.json({ error: "Invalid format. Use 3-40 lowercase letters, numbers, or hyphens." }, { status: 400 });
        const { data, error } = await (supabase as any).from("projects").update({ app_slug: slug }).eq("id", params.id).select("id, name, app_slug").single();
        if (error) {
          if (error.code === "23505") return Response.json({ error: "This URL is already taken." }, { status: 409 });
          return Response.json({ error: error.message }, { status: 500 });
        }
        return Response.json(data);
      },
    },
  },
});
