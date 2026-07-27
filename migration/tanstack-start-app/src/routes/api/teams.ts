// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/teams — GET memberships, POST create team. */
export const Route = createFileRoute("/api/teams")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: memberships } = await (supabase as any)
          .from("team_members")
          .select(`role, credits_used, credit_allowance, accepted_at, teams (id, name, slug, plan, credits, max_members, avatar_url, owner_id, created_at)`)
          .eq("user_id", user.id).not("accepted_at", "is", null);
        return Response.json({ teams: memberships ?? [] });
      },
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { name } = await request.json().catch(() => ({}));
        if (!name?.trim()) return Response.json({ error: "Team name required" }, { status: 400 });
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);
        const { data: teamId, error } = await (supabase as any).rpc("create_team", { p_name: name.trim(), p_slug: slug, p_owner_id: user.id });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const { data: team } = await (supabase as any).from("teams").select("*").eq("id", teamId).single();
        return Response.json({ team }, { status: 201 });
      },
    },
  },
});
