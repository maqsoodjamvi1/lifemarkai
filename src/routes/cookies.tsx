import { createFileRoute } from "@tanstack/react-router";
import { SimplePublicPage } from "@/components/marketing/simple-public-page";

export const Route = createFileRoute("/cookies")({
  head: () => ({ meta: [{ title: "Cookie Policy - LifemarkAI" }] }),
  component: () => (
    <SimplePublicPage
      eyebrow="Legal"
      title="Cookie Policy"
      description="This page explains how LifemarkAI uses cookies and similar technologies."
      sections={[
        { title: "Essential cookies", body: "We use essential cookies for authentication, session security, and core application behavior." },
        { title: "Analytics", body: "When analytics are enabled, they are used to understand product reliability and improve the builder experience." },
      ]}
    />
  ),
});
