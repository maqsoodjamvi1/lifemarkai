import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/teams/transfer — transfer credits to a user or team pool. */
export const Route = createFileRoute("/api/teams/transfer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { toUserId, toTeamId, amount, note } = await request.json().catch(() => ({}));
        if (!amount || amount <= 0) return Response.json({ error: "Invalid amount" }, { status: 400 });
        if (!toUserId && !toTeamId) return Response.json({ error: "Recipient required" }, { status: 400 });
        const { data: ok, error } = await supabase.rpc("transfer_credits", {
          p_from_user_id: user.id, p_to_user_id: toUserId ?? null, p_to_team_id: toTeamId ?? null, p_amount: amount, p_note: note ?? null,
        });
        if (error || !ok) return Response.json({ error: "Transfer failed — insufficient credits or invalid recipient" }, { status: 400 });
        return Response.json({ ok: true });
      },
    },
  },
});
