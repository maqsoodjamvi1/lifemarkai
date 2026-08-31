import { createFileRoute } from "@tanstack/react-router";
import { SimplePublicPage } from "@/components/marketing/simple-public-page";

export const Route = createFileRoute("/api-reference")({
  head: () => ({ meta: [{ title: "API Reference - LifemarkAI" }] }),
  component: () => (
    <SimplePublicPage
      eyebrow="Developers"
      title="API Reference"
      description="Reference docs for public APIs, webhooks, and integration surfaces will live here."
      sections={[
        { title: "Current entry point", body: "Start with the documentation page for MCP, cloud, deployment, and integration setup." },
        { title: "Support", body: "If you need a specific API documented, contact support and include the route or workflow you are integrating with." },
      ]}
    />
  ),
});
