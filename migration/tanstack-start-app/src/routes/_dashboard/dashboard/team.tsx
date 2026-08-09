import { createFileRoute,getRouteApi } from "@tanstack/react-router";
import { fetchTeamPage } from "@/lib/dashboard-server";
import { TeamShellPage } from "@/components/dashboard/shell-pages";

export const Route = createFileRoute("/_dashboard/dashboard/team")({
  loader: () => fetchTeamPage(),
  head: () => ({ meta: [{ title: "Team — LifemarkAI" }] }),
  component: TeamRoute,
});

const layoutApi = getRouteApi("/_dashboard");

function TeamRoute() {
  const data = Route.useLoaderData();
  const { user } = layoutApi.useLoaderData();
  return (
    <TeamShellPage
      user={user!}
      profile={data.profile}
      personalProjects={data.personalProjects}
      teams={data.teams}
    />
  );
}
