import { createFileRoute,getRouteApi } from "@tanstack/react-router";
import { SCIMSetupPage } from "@/components/dashboard/scim-setup-page";

const layoutApi = getRouteApi("/_dashboard");

export const Route = createFileRoute("/_dashboard/dashboard/settings/scim")({
  head: () => ({ meta: [{ title: "SCIM — LifemarkAI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { user, profile } = layoutApi.useLoaderData();
  return <SCIMSetupPage />;
}
