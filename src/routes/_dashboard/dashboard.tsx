/**
 * /dashboard — home page (nested under the _dashboard layout).
 *
 * Port of app/(dashboard)/dashboard/page.tsx. The key conversion:
 *   - async Server Component body            → route `loader` (fetchDashboardHome)
 *   - `const { tab } = await searchParams`   → `Route.useSearch()` + validateSearch
 *   - `export const metadata`                → route `head()`
 * The JSX body is unchanged — it renders the same client components with the
 * data the loader produced.
 */
import { createFileRoute,getRouteApi } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { fetchDashboardHome } from "@/lib/dashboard-server";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { ProjectBrowserTabs } from "@/components/dashboard/project-browser-tabs";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { PinnedRail } from "@/components/dashboard/pinned-rail";
import { GettingStartedChecklist } from "@/components/dashboard/getting-started-checklist";
import { ContinueCard } from "@/components/dashboard/continue-card";
import { RecentlyVisited } from "@/components/dashboard/recently-visited";
import { ProjectInsightsCard } from "@/components/dashboard/project-insights-card";
import { BillingAlertBanner } from "@/components/dashboard/billing-alert-banner";

const dashboardSearchSchema = z
  .object({
    tab: z.string().optional(),
    new: z.string().optional(),
    fromUrl: z.string().optional(),
    prompt: z.string().optional(),
  })
  .catch({});

export const Route = createFileRoute("/_dashboard/dashboard")({
  validateSearch: zodValidator(dashboardSearchSchema),
  loader: async () => await fetchDashboardHome(),
  head: () => ({ meta: [{ title: "Dashboard — LifemarkAI" }] }),
  component: DashboardPage,
});

// Read the parent _dashboard layout's loader data (the verified user) without refetching.
const dashboardLayoutApi = getRouteApi("/_dashboard");

function DashboardPage() {
  const { projects, profile, featuredTemplates } = Route.useLoaderData();
  const { user } = dashboardLayoutApi.useLoaderData();
  const { tab, new: newProject, fromUrl } = Route.useSearch();

  const isNewUser = !projects || projects.length === 0;
  const firstName =
    profile?.full_name?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "Builder";

  const initialTab =
    tab === "starred" ? "starred"
    : tab === "recent" ? "recent"
    : tab === "shared" ? "shared"
    : tab === "visitors" ? "visitors"
    : "mine";
  const isPromptHandoff =
    newProject === "true" ||
    newProject === "1" ||
    fromUrl === "true" ||
    fromUrl === "1";

  return (
    <div className="flex-1 overflow-auto">
      <DashboardHeader user={user!} profile={profile} compact />
      <BillingAlertBanner credits={profile?.credits ?? 0} plan={profile?.plan ?? "free"} />

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-8">
        <DashboardHero firstName={firstName} />

        {!isNewUser && (
          <>
            <PinnedRail projects={projects ?? []} />
            <ContinueCard projects={projects ?? []} />
            <RecentlyVisited projects={projects ?? []} />
          </>
        )}

        {isNewUser && (
          <GettingStartedChecklist
            hasProjects={!isNewUser}
            hasDeployment={projects?.some((project) => !!project.deployed_url) ?? false}
            hasShared={projects?.some((project) => project.is_public) ?? false}
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

        {!isNewUser && <ProjectInsightsCard />}

        {!isNewUser && <ActivityFeed />}
      </div>

      <DashboardClient
        showOnboarding={isNewUser && !isPromptHandoff}
        showSetupWizard={!profile?.setup_complete && isNewUser && !isPromptHandoff}
        projects={(projects ?? []).map((project) => ({ id: project.id, name: project.name, framework: project.framework }))}
        credits={profile?.credits ?? 0}
      />
    </div>
  );
}
