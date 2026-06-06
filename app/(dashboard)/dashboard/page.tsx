// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ProjectsGrid } from "@/components/dashboard/projects-grid";
import { PromptCreateBox } from "@/components/dashboard/prompt-create-box";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { ProjectsWithGroups } from "@/components/dashboard/projects-with-groups";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { PinnedRail } from "@/components/dashboard/pinned-rail";
import { RecentlyVisited } from "@/components/dashboard/recently-visited";
import { GettingStartedChecklist } from "@/components/dashboard/getting-started-checklist";
import { ContinueCard } from "@/components/dashboard/continue-card";
import { FeaturedTemplates } from "@/components/dashboard/featured-templates";
import { ProjectInsightsCard } from "@/components/dashboard/project-insights-card";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: projects } = await (supabase as any)
    .from("projects")
    .select("*, project_files(count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Fetch featured templates (for quick-access section)
  const { data: featuredTemplates } = await (supabase as any)
    .from("templates")
    .select("id, name, description, framework, fork_count, tags, preview_url")
    .order("fork_count", { ascending: false })
    .limit(6);

  // Show onboarding for new users (no projects yet)
  const isNewUser = !projects || projects.length === 0;

  return (
    <div className="flex-1 overflow-auto">
      <DashboardHeader user={user} profile={profile} />
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <StatsCards projects={projects ?? []} credits={profile?.credits ?? 0} />

        {/* Pinned projects rail — hidden when no starred projects */}
        <PinnedRail projects={projects ?? []} />

        {/* Weekly AI insights — aggregates usage for last 7 days */}
        <ProjectInsightsCard
          projectId={projects?.[0]?.id}
          projectName={projects?.[0]?.name}
        />

        {/* Recently visited — client-side, reads localStorage */}
        <RecentlyVisited projects={projects ?? []} />

        {/* Lovable-style prompt-first project creation */}
        <PromptCreateBox />

        {/* Continue where you left off — most recently updated project */}
        {!isNewUser && (
          <ContinueCard projects={projects ?? []} />
        )}

        {/* Getting started checklist — shown to new users with 0 projects */}
        {isNewUser && (
          <GettingStartedChecklist
            hasProjects={!isNewUser}
            hasDeployment={projects?.some((p: any) => !!p.deployed_url) ?? false}
            hasShared={projects?.some((p: any) => p.is_public) ?? false}
          />
        )}

        {/* Featured templates quick-access row */}
        <FeaturedTemplates
          templates={featuredTemplates ?? []}
          projectCount={projects?.length ?? 0}
        />

        {/* Recent activity feed */}
        <ActivityFeed />

        <div>
          <h2 className="text-xl font-semibold mb-1">Your Projects</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {projects?.length ?? 0} project{projects?.length !== 1 ? "s" : ""}
          </p>
          <ProjectsWithGroups projects={projects ?? []} />
        </div>
      </div>


      {/* Client-side: onboarding modal + command palette + low-credits toast */}
      <DashboardClient
        showOnboarding={isNewUser}
        showSetupWizard={!(profile as any)?.setup_complete && isNewUser}
        projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name, framework: p.framework as string }))}
        credits={profile?.credits ?? 0}
      />
    </div>
  );
}
