import { createFileRoute,getRouteApi } from "@tanstack/react-router";
import { AuditLogsPage } from "@/components/dashboard/audit-logs-page";

const layoutApi = getRouteApi("/_dashboard");

export const Route = createFileRoute("/_dashboard/dashboard/audit-logs")({
  head: () => ({ meta: [{ title: "Audit Logs — LifemarkAI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { user, profile } = layoutApi.useLoaderData();
  return <AuditLogsPage userId={user!.id} />;
}
