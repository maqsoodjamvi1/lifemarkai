// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AnalyticsPage } from "@/components/dashboard/analytics-page";
import { LiveAnalyticsBanner } from "@/components/dashboard/live-analytics-banner";

export default async function Analytics() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: projects } = await (supabase as any)
    .from("projects")
    .select("id, name, created_at, status, framework")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: creditLogs } = await (supabase as any)
    .from("credit_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: deployments } = await (supabase as any)
    .from("deployments")
    .select("*, projects(name)")
    .in("project_id", (projects || []).map((p) => p.id))
    .order("created_at", { ascending: false })
    .limit(50);

  const projectIds = (projects || []).map((p: { id: string }) => p.id);

  return (
    <div>
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <LiveAnalyticsBanner projectIds={projectIds} />
      </div>
      <AnalyticsPage
        profile={profile}
        projects={projects || []}
        creditLogs={creditLogs || []}
        deployments={deployments || []}
      />
    </div>
  );
}
