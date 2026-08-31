import { createFileRoute } from "@tanstack/react-router";
import { SimplePublicPage } from "@/components/marketing/simple-public-page";

export const Route = createFileRoute("/roadmap")({
  head: () => ({ meta: [{ title: "Roadmap - LifemarkAI" }] }),
  component: () => (
    <SimplePublicPage
      eyebrow="Product"
      title="Roadmap"
      description="The roadmap focuses on better generation quality, stronger verification, managed backends, collaboration, and deployment reliability."
      sections={[
        { title: "Near term", body: "Improve prompt classification, agent verification, billing integrations, and live-preview reliability." },
        { title: "Later", body: "Deeper team workflows, richer app connectors, and more precise code-quality feedback loops." },
      ]}
    />
  ),
});
