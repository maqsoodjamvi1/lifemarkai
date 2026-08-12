import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/marketing/navbar";
import { LovableStyleLanding } from "@/components/marketing/lovable-style-landing";
import { Footer } from "@/components/marketing/footer";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "LifemarkAI — Build apps with AI" }] }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main><LovableStyleLanding /></main>
      <Footer />
    </div>
  );
}
