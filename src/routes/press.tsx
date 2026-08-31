import { createFileRoute } from "@tanstack/react-router";
import { SimplePublicPage } from "@/components/marketing/simple-public-page";

export const Route = createFileRoute("/press")({
  head: () => ({ meta: [{ title: "Press - LifemarkAI" }] }),
  component: () => (
    <SimplePublicPage
      eyebrow="Company"
      title="Press"
      description="Press resources, product screenshots, and company information will be collected here."
      sections={[
        { title: "Contact", body: "For press questions, email press@lifemarkai.com." },
      ]}
    />
  ),
});
