import { createFileRoute,getRouteApi } from "@tanstack/react-router";
import { WorkspaceKnowledgePage } from "@/components/dashboard/workspace-knowledge-page";

const layoutApi = getRouteApi("/_dashboard");

export const Route = createFileRoute("/_dashboard/dashboard/settings/workspace-knowledge")({
  head: () => ({ meta: [{ title: "Workspace Knowledge — LifemarkAI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { user, profile } = layoutApi.useLoaderData();
  return <WorkspaceKnowledgePage user={user!} />;
}
