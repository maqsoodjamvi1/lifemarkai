// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/snippets/:id — PATCH edit, DELETE, POST increment use-count. */
export const Route = createFileRoute("/api/snippets/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = await request.json().catch(() => ({}));
        const patch: Record<string, unknown> = {};
        if (typeof body.title === "string") {
          const t = body.title.trim();
          if (!t || t.length > 100) return Response.json({ error: "Title must be 1–100 characters." }, { status: 400 });
          patch.title = t;
        }
        if (typeof body.content === "string") {
          const c = body.content.trim();
          if (!c || c.length > 4000) return Response.json({ error: "Content must be 1–4000 characters." }, { status: 400 });
          patch.content = c;
        }
        if (Array.isArray(body.tags)) patch.tags = body.tags.map(String);
        if (typeof body.is_public === "boolean") patch.is_public = body.is_public;
        if (Object.keys(patch).length === 0) return Response.json({ error: "Nothing to update." }, { status: 400 });
        const { data, error } = await (supabase as any).from("prompt_snippets").update(patch).eq("id", params.id).eq("user_id", user.id).select("*").single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!data) return Response.json({ error: "Not found or forbidden" }, { status: 404 });
        return Response.json(data);
      },
      DELETE: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { error } = await (supabase as any).from("prompt_snippets").delete().eq("id", params.id).eq("user_id", user.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return new Response(null, { status: 204 });
      },
      POST: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { error } = await (supabase as any).rpc("increment_snippet_use_count", { snippet_id: params.id });
        if (error) {
          const { data: existing } = await (supabase as any).from("prompt_snippets").select("use_count").eq("id", params.id).maybeSingle();
          if (existing) await (supabase as any).from("prompt_snippets").update({ use_count: (existing.use_count ?? 0) + 1 }).eq("id", params.id);
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
