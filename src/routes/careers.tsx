import { createFileRoute } from "@tanstack/react-router";
import { SimplePublicPage } from "@/components/marketing/simple-public-page";

export const Route = createFileRoute("/careers")({
  head: () => ({ meta: [{ title: "Careers - LifemarkAI" }] }),
  component: () => (
    <SimplePublicPage
      eyebrow="Company"
      title="Careers"
      description="We are not listing open roles on this local build yet, but this page is ready for hiring updates."
      sections={[
        { title: "Interested?", body: "Send a short note to hello@lifemarkai.com with what you want to build and how you like to work." },
      ]}
    />
  ),
});
