// @ts-nocheck
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

        const { data: pool } = await (supabase as any).from("workspace_credit_pools").select("*").eq("team_id", id).maybeSingle();
        const { data: members } = await (supabase as any).from("team_members").select("user_id, role, profiles(email, full_name)").eq("team_id", id);
        const { data: caps } = await (supabase as any).from("workspace_member_caps").select("*").eq("team_id", id);

        const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
        const { data: logs } = await (supabase as any).from("credit_logs").select("user_id, amount")
          .gte("created_at", startOfMonth.toISOString()).in("user_id", (members ?? []).map((m: { user_id: string }) => m.user_id));

        const usageMap: Record<string, number> = {};
        for (const log of logs ?? []) usageMap[log.user_id] = (usageMap[log.user_id] ?? 0) + Math.abs(log.amount as number);
        const capMap: Record<string, number> = {};
        for (const cap of caps ?? []) capMap[cap.user_id] = cap.monthly_cap;

        const memberData = (members ?? []).map((m: any) => ({
          userId: m.user_id, email: m.profiles?.email ?? "", name: m.profiles?.full_name ?? m.profiles?.email ?? "Member",
          role: m.role, used: usageMap[m.user_id] ?? 0, cap: capMap[m.user_id] ?? 0,
        }));

        return Response.json({ teamId: id, totalCredits: pool?.total_credits ?? 0, usedCredits: pool?.used_credits ?? 0, resetDay: pool?.reset_day ?? 1, members: memberData });
      },
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { amount } = (await request.json().catch(() => ({}))) as { amount: number };
        if (!Number.isInteger(amount) || amount <= 0) return Response.json({ error: "Amount must be a positive whole number" }, { status: 400 });
        const { data, error } = await (supabase as any).rpc("fund_workspace_credit_pool", { p_team_id: params.id, p_user_id: user.id, p_amount: amount });
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
