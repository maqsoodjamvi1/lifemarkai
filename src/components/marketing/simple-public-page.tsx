import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/marketing/footer";
import { Navbar } from "@/components/marketing/navbar";
import { Button } from "@/components/ui/button";

interface SimplePublicPageProps {
  title: string;
  eyebrow?: string;
  description: string;
  sections?: Array<{ title: string; body: string }>;
}

export function SimplePublicPage({ title, eyebrow, description, sections = [] }: SimplePublicPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-28">
        {eyebrow && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">{description}</p>

        {sections.length > 0 && (
          <div className="mt-10 space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-semibold">{section.title}</h2>
                <p className="mt-2 leading-7 text-muted-foreground">{section.body}</p>
              </section>
            ))}
          </div>
        )}

        <div className="mt-12">
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back home
            </Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
