// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { ProjectBrowserTabs } from "@/components/dashboard/project-browser-tabs";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { PinnedRail } from "@/components/dashboard/pinned-rail";
import { GettingStartedChecklist } from "@/components/dashboard/getting-started-checklist";
import { ContinueCard } from "@/components/dashboard/continue-card";
import { BillingAlertBanner } from "@/components/dashboard/billing-alert-banner";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: projects } = await (supabase as any)
    .from("projects")
    .select("*, project_files(count)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: featuredTemplates } = await (supabase as any)
    .from("templates")
    .select("id, name, description, framework, fork_count, tags, preview_url")
    .order("fork_count", { ascending: false })
    .limit(6);

  const isNewUser = !projects || projects.length === 0;
  const firstName =
    profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "Builder";

  const initialTab =
    tab === "starred" ? "starred"
    : tab === "recent" ? "recent"
    : tab === "shared" ? "shared"
    : tab === "visitors" ? "visitors"
    : "mine";

  return (
    <div className="flex-1 overflow-auto">
      <DashboardHeader user={user} profile={profile} compact />
      <BillingAlertBanner credits={profile?.credits ?? 0} plan={profile?.plan ?? "free"} />

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-8">
        <DashboardHero firstName={firstName} />

        {!isNewUser && (
          <>
            <PinnedRail projects={projects ?? []} />
            <ContinueCard projects={projects ?? []} />
          </>
        )}

        {isNewUser && (
          <GettingStartedChecklist
            hasProjects={!isNewUser}
            hasDeployment={projects?.some((p: any) => !!p.deployed_url) ?? false}
            hasShared={projects?.some((p: any) => p.is_public) ?? false}
          />
        )}

        <div>
          <ProjectBrowserTabs
            projects={projects ?? []}
            templates={featuredTemplates ?? []}
            initialTab={initialTab}
          />
        </div>

        {!isNewUser && (
          <StatsCards projects={projects ?? []} credits={profile?.credits ?? 0} />
        )}

        {!isNewUser && <ActivityFeed />}
      </div>

      <DashboardClient
        showOnboarding={isNewUser}
        showSetupWizard={!(profile as any)?.setup_complete && isNewUser}
        projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name, framework: p.framework as string }))}
        credits={profile?.credits ?? 0}
      />
    </div>
  );
}
