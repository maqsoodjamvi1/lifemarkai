import { createFileRoute } from "@tanstack/react-router";
import { SimplePublicPage } from "@/components/marketing/simple-public-page";

export const Route = createFileRoute("/status")({
  head: () => ({ meta: [{ title: "Status - LifemarkAI" }] }),
  component: () => (
    <SimplePublicPage
      eyebrow="System"
      title="Status"
      description="This local status page confirms that the LifemarkAI web app route is available."
      sections={[
        { title: "Local health", body: "For runtime checks, use the built-in health routes and deployment smoke tests from the project scripts." },
      ]}
    />
  ),
});
