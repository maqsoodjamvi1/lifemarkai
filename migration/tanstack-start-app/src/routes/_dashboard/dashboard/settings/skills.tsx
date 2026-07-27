import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { WorkspaceSkillsPage } from "@/components/dashboard/workspace-skills-page";

const layoutApi = getRouteApi("/_dashboard");

export const Route = createFileRoute("/_dashboard/dashboard/settings/skills")({
  head: () => ({ meta: [{ title: "Workspace Skills — LifemarkAI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { user, profile } = layoutApi.useLoaderData();
  return <WorkspaceSkillsPage user={user!} />;
}
