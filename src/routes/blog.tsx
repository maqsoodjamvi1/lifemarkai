import { createFileRoute } from "@tanstack/react-router";
import { SimplePublicPage } from "@/components/marketing/simple-public-page";

export const Route = createFileRoute("/blog")({
  head: () => ({ meta: [{ title: "Blog - LifemarkAI" }] }),
  component: () => (
    <SimplePublicPage
      eyebrow="Company"
      title="Blog"
      description="Product updates, engineering notes, and builder stories will be published here."
      sections={[
        { title: "For now", body: "Read the changelog for the latest shipped product updates." },
      ]}
    />
  ),
});
