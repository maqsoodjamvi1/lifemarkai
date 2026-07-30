// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/snippets — GET (q/tag/scope), POST create. */
export const Route = createFileRoute("/api/snippets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const sp = new URL(request.url).searchParams;
        const q = sp.get("q") ?? "";
        const tag = sp.get("tag") ?? "";
        const scope = sp.get("scope") ?? "all";
        let query = (supabase as any).from("prompt_snippets")
          .select("id, user_id, title, content, tags, is_public, use_count, created_at, updated_at")
          .order("use_count", { ascending: false }).limit(100);
        if (scope === "mine") query = query.eq("user_id", user.id);
        else if (scope === "public") query = query.eq("is_public", true);
        if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
        if (tag) query = query.contains("tags", [tag]);
        const { data, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json(data ?? []);
      },
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = await request.json().catch(() => ({}));
        const title: string = (body.title ?? "").trim();
        const content: string = (body.content ?? "").trim();
        const tags: string[] = Array.isArray(body.tags) ? body.tags.map(String) : [];
        const is_public = !!body.is_public;
        if (!title || title.length > 100) return Response.json({ error: "Title must be 1–100 characters." }, { status: 400 });
        if (!content || content.length > 4000) return Response.json({ error: "Content must be 1–4000 characters." }, { status: 400 });
        const { data, error } = await (supabase as any).from("prompt_snippets").insert({ user_id: user.id, title, content, tags, is_public }).select("*").single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json(data, { status: 201 });
      },
    },
  },
});
