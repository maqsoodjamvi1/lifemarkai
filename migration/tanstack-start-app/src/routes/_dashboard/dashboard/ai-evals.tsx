import { createFileRoute,getRouteApi } from "@tanstack/react-router";
import { AiEvalsPage } from "@/components/dashboard/ai-evals-page";

const layoutApi = getRouteApi("/_dashboard");

export const Route = createFileRoute("/_dashboard/dashboard/ai-evals")({
  head: () => ({ meta: [{ title: "AI Evals — LifemarkAI" }] }),
  component: RouteComponent,
});

function RouteComponent() {
  const { user, profile } = layoutApi.useLoaderData();
  return <AiEvalsPage userId={user!.id} />;
}
