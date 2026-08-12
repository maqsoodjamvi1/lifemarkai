import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

function jsonObject(value: Json): { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

/** Native /api/projects/:id/persona — GET/POST AI persona in project metadata. */
export const Route = createFileRoute("/api/projects/$id/persona")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: project } = await supabase.from("projects").select("id, user_id, metadata").eq("id", params.id).single();
        if (!project || project.user_id !== user.id) return Response.json({ error: "Not found" }, { status: 404 });
        return Response.json({ persona: jsonObject(project.metadata).persona ?? null });
      },
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: project } = await supabase.from("projects").select("id, user_id, metadata").eq("id", params.id).single();
        if (!project || project.user_id !== user.id) return Response.json({ error: "Not found" }, { status: 404 });
        const body = (await request.json().catch(() => ({}))) as { persona: unknown };
        const updatedMeta: Json = {
          ...jsonObject(project.metadata),
          persona: (body.persona ?? null) as Json,
        };
        await supabase.from("projects").update({ metadata: updatedMeta, updated_at: new Date().toISOString() }).eq("id", params.id);
        return Response.json({ ok: true });
      },
    },
  },
});
