import { createFileRoute } from "@tanstack/react-router";
import { SimplePublicPage } from "@/components/marketing/simple-public-page";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service - LifemarkAI" }] }),
  component: () => (
    <SimplePublicPage
      eyebrow="Legal"
      title="Terms of Service"
      description="These terms describe the rules for using LifemarkAI and generated applications."
      sections={[
        { title: "Use of the service", body: "Use LifemarkAI responsibly and only with content, code, and credentials you have the right to use." },
        { title: "Generated output", body: "Review generated code before deploying it to production, especially for auth, payments, data handling, and security-sensitive workflows." },
      ]}
    />
  ),
});
