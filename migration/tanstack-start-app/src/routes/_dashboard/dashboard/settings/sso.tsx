import { createFileRoute,getRouteApi } from "@tanstack/react-router";
import { SSOSetupPage } from "@/components/dashboard/sso-setup-page";

const layoutApi = getRouteApi("/_dashboard");

export const Route = createFileRoute("/_dashboard/dashboard/settings/sso")({
  head: () => ({ meta: [{ title: "SSO — LifemarkAI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { user, profile } = layoutApi.useLoaderData();
  return <SSOSetupPage />;
}
