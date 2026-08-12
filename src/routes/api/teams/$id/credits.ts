import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/teams/:id/credits — GET pool+usage, POST transfer from personal balance. */
export const Route = createFileRoute("/api/teams/$id/credits")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: team } = await supabase.from("teams").select("credits, plan, max_members").eq("id", params.id).single();
        const { data: members } = await supabase
          .from("team_members").select("user_id, credits_used, credit_allowance, role, profiles(full_name, email, avatar_url)")
          .eq("team_id", params.id).not("accepted_at", "is", null);
        const { data: logs } = await supabase
          .from("credit_logs").select("amount, action, description, created_at")
          .ilike("description", `%${params.id}%`).order("created_at", { ascending: false }).limit(50);
        return Response.json({ pool: team?.credits ?? 0, members: members ?? [], logs: logs ?? [] });
      },
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { amount, note } = await request.json().catch(() => ({}));
        if (!amount || amount <= 0) return Response.json({ error: "Invalid amount" }, { status: 400 });
        const { data: ok, error } = await supabase.rpc("transfer_credits", {
          p_from_user_id: user.id, p_to_team_id: params.id, p_amount: amount, p_note: note ?? `Topped up team pool`,
        });
        if (error || !ok) return Response.json({ error: "Insufficient credits or transfer failed" }, { status: 400 });
        return Response.json({ ok: true });
      },
    },
  },
});
