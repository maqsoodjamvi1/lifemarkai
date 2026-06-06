// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BillingPage } from "@/components/dashboard/billing-page";

export const metadata = { title: "Billing & Credits — LifemarkAI" };

export default async function BillingRoute() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, logsRes, membershipsRes] = await Promise.all([
    (supabase as any).from("profiles").select("*").eq("id", user.id).single(),
    (supabase as any).from("credit_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    (supabase as any).from("team_members")
      .select("role, credits_used, credit_allowance, teams(id, name, credits)")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null),
  ]);

  // Flatten teams for billing page
  const teams = (membershipsRes.data ?? []).map((m) => {
    const team = m.teams as unknown as { id: string; name: string; credits: number } | null;
    return {
      id:           team?.id ?? "",
      name:         team?.name ?? "",
      credits:      team?.credits ?? 0,
      role:         m.role,
    };
  }).filter((t) => t.id);

  return (
    <BillingPage
      profile={profileRes.data ?? null}
      creditLogs={logsRes.data ?? []}
      teams={teams}
    />
  );
}
