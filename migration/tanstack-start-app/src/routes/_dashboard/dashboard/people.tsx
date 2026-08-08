import { createFileRoute,getRouteApi } from "@tanstack/react-router";
import { PeoplePage } from "@/components/dashboard/people-page";

const layoutApi = getRouteApi("/_dashboard");

export const Route = createFileRoute("/_dashboard/dashboard/people")({
  head: () => ({ meta: [{ title: "People — LifemarkAI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { user, profile } = layoutApi.useLoaderData();
  return <PeoplePage currentUserId={user!.id} />;
}
