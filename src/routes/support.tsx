import { createFileRoute } from "@tanstack/react-router";
import { SimplePublicPage } from "@/components/marketing/simple-public-page";

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "Support - LifemarkAI" }] }),
  component: () => (
    <SimplePublicPage
      eyebrow="Help"
      title="Support"
      description="Get help with account access, billing, deployment, or generated app issues."
      sections={[
        { title: "Contact", body: "Email support@lifemarkai.com and include your account email, project name, and the error you are seeing." },
        { title: "Self-service", body: "Documentation, billing, security, and workspace settings are available from the dashboard." },
      ]}
    />
  ),
});
