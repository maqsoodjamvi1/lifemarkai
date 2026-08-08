import { createFileRoute,getRouteApi } from "@tanstack/react-router";
import { fetchAnalyticsPage } from "@/lib/dashboard-server";
import { AnalyticsShellPage } from "@/components/dashboard/shell-pages";

export const Route = createFileRoute("/_dashboard/dashboard/analytics")({
  loader: () => fetchAnalyticsPage(),
  head: () => ({ meta: [{ title: "Analytics — LifemarkAI" }] }),
  component: AnalyticsRoute,
});

const layoutApi = getRouteApi("/_dashboard");

function AnalyticsRoute() {
  const data = Route.useLoaderData();
  const { user } = layoutApi.useLoaderData();
  return (
    <AnalyticsShellPage
      user={user!}
      profile={data.profile}
      projects={data.projects}
      creditLogs={data.creditLogs}
      deployments={data.deployments}
    />
  );
}
