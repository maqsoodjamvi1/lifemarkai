import { createFileRoute,getRouteApi } from "@tanstack/react-router";
import { fetchBillingPage } from "@/lib/dashboard-server";
import { BillingShellPage } from "@/components/dashboard/shell-pages";

export const Route = createFileRoute("/_dashboard/dashboard/billing")({
  loader: () => fetchBillingPage(),
  head: () => ({ meta: [{ title: "Billing & Credits — LifemarkAI" }] }),
  component: BillingRoute,
});

const layoutApi = getRouteApi("/_dashboard");

function BillingRoute() {
  const { profile, creditLogs, teams } = Route.useLoaderData();
  const { user } = layoutApi.useLoaderData();
  return (
    <BillingShellPage user={user!} profile={profile} creditLogs={creditLogs} teams={teams} />
  );
}
