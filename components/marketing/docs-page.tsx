import Link from "next/link";
import { DOC_PAGES, getDocBySlug, type DocPage } from "@/lib/docs/content";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";

function renderBody(text: string) {
  return text.split("\n").map((line, i) => {
    const html = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code class=\"px-1 py-0.5 rounded bg-muted text-sm\">$1</code>");
    if (line.startsWith("```")) return null;
    if (line.trim() === "") return <br key={i} />;
    return <p key={i} className="text-muted-foreground leading-relaxed mb-2" dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

function DocContent({ page }: { page: DocPage }) {
  return (
    <article className="max-w-2xl">
      <p className="text-xs uppercase tracking-wider text-violet-400 mb-2">{page.category}</p>
      <h1 className="text-3xl font-bold mb-2">{page.title}</h1>
      <p className="text-muted-foreground mb-8">{page.description}</p>
      <div className="space-y-6">
        {page.sections.map((s, i) => (
          <section key={i}>
            {s.heading && <h2 className="text-lg font-semibold mb-2">{s.heading}</h2>}
            <div>{renderBody(s.body)}</div>
          </section>
        ))}
      </div>
    </article>
  );
}

export function DocsIndexPage() {
  const byCategory = DOC_PAGES.reduce<Record<string, typeof DOC_PAGES>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-2">Documentation</h1>
        <p className="text-muted-foreground mb-10">Guides for building, deploying, and integrating LifemarkAI.</p>
        <div className="grid md:grid-cols-2 gap-8">
          {Object.entries(byCategory).map(([cat, pages]) => (
            <div key={cat}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{cat}</h2>
              <ul className="space-y-2">
                {pages.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/docs/${p.slug}`} className="block p-3 rounded-xl border border-border hover:border-violet-500/40 hover:bg-muted/30 transition">
                      <span className="font-medium">{p.title}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">{p.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function DocsSlugPage({ slug }: { slug: string }) {
  const page = getDocBySlug(slug);
  if (!page) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">Page not found</h1>
          <Link href="/docs" className="text-violet-400 hover:underline mt-4 inline-block">← Back to docs</Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-12 flex flex-col md:flex-row gap-10">
        <aside className="md:w-56 shrink-0">
          <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">← All docs</Link>
          <nav className="space-y-1">
            {DOC_PAGES.map((p) => (
              <Link
                key={p.slug}
                href={`/docs/${p.slug}`}
                className={`block text-sm py-1.5 px-2 rounded-md ${p.slug === slug ? "bg-violet-500/10 text-violet-300 font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                {p.title}
              </Link>
            ))}
          </nav>
        </aside>
        <DocContent page={page} />
      </main>
      <Footer />
    </div>
  );
}
