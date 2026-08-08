import { createFileRoute,Link } from "@tanstack/react-router";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { DOC_PAGES } from "@/lib/docs/content";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — LifemarkAI" },
      {
        name: "description",
        content: "Guides for building, deploying, and integrating with LifemarkAI.",
      },
    ],
  }),
  component: DocsPage,
});

function DocsPage() {
  const byCategory = DOC_PAGES.reduce<Record<string, typeof DOC_PAGES>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-16 px-6 max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Documentation</h1>
        <p className="text-muted-foreground mb-10">
          Guides for building, deploying, and integrating with LifemarkAI.
        </p>
        {Object.entries(byCategory).map(([cat, pages]) => (
          <div key={cat} className="mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {cat}
            </h2>
            <ul className="space-y-2">
              {pages.map((p) => (
                <li key={p.slug}>
                  <Link
                    to="/docs/$slug"
                    params={{ slug: p.slug }}
                    className="block rounded-lg border border-border px-4 py-3 hover:border-violet-500/40"
                  >
                    <div className="font-medium">{p.title}</div>
                    <div className="text-sm text-muted-foreground">{p.description}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </main>
      <Footer />
    </div>
  );
}
