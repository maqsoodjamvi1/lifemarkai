import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/teams/:id/credit-pool — GET pool+caps+usage, POST fund pool. */
export const Route = createFileRoute("/api/teams/$id/credit-pool")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: pool } = await supabase.from("workspace_credit_pools").select("*").eq("team_id", id).maybeSingle();
        const { data: members } = await supabase
          .from("team_members")
          .select("user_id, role, profiles!team_members_user_id_fkey(email, full_name)")
          .eq("team_id", id);
        const { data: caps } = await supabase.from("workspace_member_caps").select("*").eq("team_id", id);

        const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
        const { data: logs } = await supabase.from("credit_logs").select("user_id, amount")
          .gte("created_at", startOfMonth.toISOString())
          .in(
            "user_id",
            (members ?? []).flatMap((member) =>
              typeof member.user_id === "string" ? [member.user_id] : [],
            ),
          );

        // `credit_logs.amount` is signed: negative for real spend
        // (settle_credit_reservation, deduct_workspace_credits, ...), positive
        // for grants, purchases and renewals (grant_daily_credits's daily
        // 5-credit grant among them). Summing Math.abs() of every entry counted
        // a member's own free daily credits as if they were usage, inflating
        // "used" by up to the monthly grant cap (30 or 150) on top of whatever
        // they actually spent — every member's usage bar read too high, with no
        // way to tell from this screen alone. Only negative entries are real
        // consumption.
        const usageMap: Record<string, number> = {};
        for (const log of logs ?? []) {
          const amount = log.amount as number;
          if (amount >= 0) continue;
          usageMap[log.user_id] = (usageMap[log.user_id] ?? 0) + Math.abs(amount);
        }
        const capMap: Record<string, number> = {};
        for (const cap of caps ?? []) capMap[cap.user_id] = cap.monthly_cap;

        const memberData = (members ?? []).flatMap((member) => {
          if (!member.user_id) return [];
          return [{
            userId: member.user_id,
            email: member.profiles?.email ?? "",
            name: member.profiles?.full_name ?? member.profiles?.email ?? "Member",
            role: member.role,
            used: usageMap[member.user_id] ?? 0,
            cap: capMap[member.user_id] ?? 0,
          }];
        });

        return Response.json({ teamId: id, totalCredits: pool?.total_credits ?? 0, usedCredits: pool?.used_credits ?? 0, resetDay: pool?.reset_day ?? 1, members: memberData });
      },
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { amount } = (await request.json().catch(() => ({}))) as { amount: number };
        if (!Number.isInteger(amount) || amount <= 0) return Response.json({ error: "Amount must be a positive whole number" }, { status: 400 });
        const { data, error } = await supabase.rpc("fund_workspace_credit_pool", { p_team_id: params.id, p_user_id: user.id, p_amount: amount });
        if (error) return Response.json({ error: error.message }, { status: 400 });
        if (!data?.ok) {
          const status = data?.error === "Insufficient personal credits" ? 402 : 403;
          return Response.json({ error: data?.error ?? "Unable to fund workspace" }, { status });
        }
        return Response.json({ ok: true, remainingCredits: data.remaining });
      },
    },
  },
});
