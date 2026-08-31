import { createFileRoute } from "@tanstack/react-router";
import { SimplePublicPage } from "@/components/marketing/simple-public-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy - LifemarkAI" }] }),
  component: () => (
    <SimplePublicPage
      eyebrow="Legal"
      title="Privacy Policy"
      description="This page summarizes how LifemarkAI handles account, project, billing, and usage data."
      sections={[
        { title: "Data we process", body: "LifemarkAI stores account details, project files, messages, deployment metadata, billing status, and operational telemetry needed to run the product." },
        { title: "Your control", body: "Account export and privacy controls are available from dashboard settings when signed in." },
      ]}
    />
  ),
});
