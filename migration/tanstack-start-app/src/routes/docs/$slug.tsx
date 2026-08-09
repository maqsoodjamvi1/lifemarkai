import { createFileRoute,Link,notFound } from "@tanstack/react-router";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { DOC_PAGES } from "@/lib/docs/content";

export const Route = createFileRoute("/docs/$slug")({
  loader: ({ params }) => {
    const page = DOC_PAGES.find((p) => p.slug === params.slug);
    if (!page) throw notFound();
    return { page };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.page
          ? `${loaderData.page.title} — LifemarkAI Docs`
          : "Docs — LifemarkAI",
      },
      { name: "description", content: loaderData?.page?.description ?? "" },
    ],
  }),
  component: DocSlugPage,
});

function DocSlugPage() {
  const { page } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-16 px-6 max-w-3xl mx-auto prose prose-invert">
        <Link to="/docs" className="text-sm text-violet-400 no-underline">
          ← All docs
        </Link>
        <h1 className="mt-4">{page.title}</h1>
        <p className="text-muted-foreground">{page.description}</p>
        {page.sections.map((section, i) => (
          <section key={i} className="mt-8">
            {section.heading && <h2>{section.heading}</h2>}
            <div className="whitespace-pre-wrap text-sm leading-relaxed opacity-90">
              {section.body}
            </div>
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
}
