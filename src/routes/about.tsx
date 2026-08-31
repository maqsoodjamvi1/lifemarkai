import { createFileRoute } from "@tanstack/react-router";
import { SimplePublicPage } from "@/components/marketing/simple-public-page";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About - LifemarkAI" }] }),
  component: () => (
    <SimplePublicPage
      eyebrow="Company"
      title="About LifemarkAI"
      description="LifemarkAI helps builders turn plain-language ideas into working, full-stack software."
      sections={[
        { title: "What we build for", body: "The product is shaped around fast iteration, readable code, reliable previews, and a path from idea to deployed app." },
        { title: "How we work", body: "We combine AI planning, code generation, verification, managed backend tools, and deployment workflows in one editor." },
      ]}
    />
  ),
});
