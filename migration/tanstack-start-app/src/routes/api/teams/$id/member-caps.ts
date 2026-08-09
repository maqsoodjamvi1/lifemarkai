import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/teams/:id/member-caps — POST set a member's monthly credit cap. */
export const Route = createFileRoute("/api/teams/$id/member-caps")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { userId, cap } = (await request.json().catch(() => ({}))) as { userId: string; cap: number };
        const { error } = await supabase.from("workspace_member_caps").upsert({
          team_id: params.id, user_id: userId, monthly_cap: cap ?? 0, updated_at: new Date().toISOString(),
        }, { onConflict: "team_id,user_id" });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
