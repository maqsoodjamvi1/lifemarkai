import { createFileRoute,getRouteApi } from "@tanstack/react-router";
import { fetchProjectsPage } from "@/lib/dashboard-server";
import { ProjectsShellPage } from "@/components/dashboard/shell-pages";

export const Route = createFileRoute("/_dashboard/dashboard/projects")({
  loader: () => fetchProjectsPage(),
  head: () => ({ meta: [{ title: "Projects — LifemarkAI" }] }),
  component: ProjectsRoute,
});

const layoutApi = getRouteApi("/_dashboard");

function ProjectsRoute() {
  const { projects, profile } = Route.useLoaderData();
  const { user } = layoutApi.useLoaderData();
  return <ProjectsShellPage user={user!} profile={profile} projects={projects} />;
}
