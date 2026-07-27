import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { InboxPage } from "@/components/dashboard/inbox-page";

const layoutApi = getRouteApi("/_dashboard");

export const Route = createFileRoute("/_dashboard/dashboard/inbox")({
  head: () => ({ meta: [{ title: "Inbox — LifemarkAI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { user, profile } = layoutApi.useLoaderData();
  return <InboxPage userId={user!.id} />;
}
