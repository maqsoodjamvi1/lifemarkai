// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/teams/:id — GET detail, PATCH update (owner), DELETE (owner). */
export const Route = createFileRoute("/api/teams/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: team } = await (supabase as any).from("teams").select("*").eq("id", params.id).single();
        if (!team) return Response.json({ error: "Not found" }, { status: 404 });
        const { data: members } = await (supabase as any)
          .from("team_members")
          .select(`id, role, credits_used, credit_allowance, accepted_at, created_at, invited_email, profiles (id, full_name, email, avatar_url)`)
          .eq("team_id", params.id).order("created_at");
        const { data: projects } = await (supabase as any)
          .from("projects").select("id, name, status, framework, deployed_url, created_at")
          .eq("team_id", params.id).order("created_at", { ascending: false });
        return Response.json({ team, members: members ?? [], projects: projects ?? [] });
      },
      PATCH: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = await request.json().catch(() => ({}));
        const updates: Record<string, unknown> = {};
        if (body.name) updates.name = body.name;
        if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url;
        const { data, error } = await (supabase as any).from("teams").update(updates).eq("id", params.id).eq("owner_id", user.id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ team: data });
      },
      DELETE: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { error } = await (supabase as any).from("teams").delete().eq("id", params.id).eq("owner_id", user.id);
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ ok: true });
      },
    },
  },
});
