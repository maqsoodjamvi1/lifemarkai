import { createFileRoute,Link } from "@tanstack/react-router";
import { fetchTemplatesPage } from "@/lib/dashboard-server";
import { templatesSearchValidator } from "@/lib/route-search";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { Button } from "@/components/ui/button";

const CATEGORIES = ["All", "Landing Page", "Dashboard", "SaaS", "E-commerce", "Blog", "Portfolio"];

export const Route = createFileRoute("/templates")({
  validateSearch: templatesSearchValidator,
  loaderDeps: ({ search }) => ({ category: search.category }),
  loader: ({ deps }) => fetchTemplatesPage({ data: { category: deps.category } }),
  head: () => ({
    meta: [
      { title: "Templates — LifemarkAI" },
      { name: "description", content: "Start faster with professionally designed templates." },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const { templates, signedIn } = Route.useLoaderData();
  const { category } = Route.useSearch();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-16 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-2">Templates</h1>
          <p className="text-muted-foreground">Fork a starting point and customize with AI.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {CATEGORIES.map((c) => (
            <Link key={c} to="/templates" search={{ category: c }}>
              <Button size="sm" variant={category === c ? "default" : "outline"}>
                {c}
              </Button>
            </Link>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div key={template.id} className="rounded-xl border border-border p-4 flex flex-col gap-2">
              <div className="font-semibold">{template.name}</div>
              <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>
              <div className="text-xs text-muted-foreground mt-auto">
                {template.category} · {template.fork_count ?? 0} forks
              </div>
              <Link to={signedIn ? "/dashboard" : "/signup"}>
                <Button className="w-full" size="sm">
                  Use template
                </Button>
              </Link>
            </div>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full text-center">
              No templates in this category yet.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
