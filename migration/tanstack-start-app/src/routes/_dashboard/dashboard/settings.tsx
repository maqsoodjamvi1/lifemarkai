import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { SettingsPage } from "@/components/dashboard/settings-page";

const layoutApi = getRouteApi("/_dashboard");

export const Route = createFileRoute("/_dashboard/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings — LifemarkAI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { user, profile } = layoutApi.useLoaderData();
  return <SettingsPage user={user!} profile={profile} />;
}
