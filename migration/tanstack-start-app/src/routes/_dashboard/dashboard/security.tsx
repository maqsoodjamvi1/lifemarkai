import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { SecurityCenterPage } from "@/components/dashboard/security-center-page";

const layoutApi = getRouteApi("/_dashboard");

export const Route = createFileRoute("/_dashboard/dashboard/security")({
  head: () => ({ meta: [{ title: "Security Center — LifemarkAI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { user, profile } = layoutApi.useLoaderData();
  return <SecurityCenterPage userId={user!.id} />;
}
