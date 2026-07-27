import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { fetchExplorePage } from "@/lib/dashboard-server";
import { exploreSearchValidator } from "@/lib/route-search";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/explore")({
  validateSearch: exploreSearchValidator,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    fetchExplorePage({ data: { q: deps.q, framework: deps.framework, sort: deps.sort } }),
  head: () => ({
    meta: [
      { title: "Explore — LifemarkAI" },
      { name: "description", content: "Browse and fork apps built by the community." },
    ],
  }),
  component: ExplorePage,
});

function ExplorePage() {
  const { projects } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/explore" });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-16 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Explore</h1>
          <p className="text-muted-foreground">Public apps from the community.</p>
        </div>
        <form
          className="flex flex-wrap gap-2 justify-center mb-10"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const q = String(fd.get("q") ?? "");
            void navigate({ search: { ...search, q } });
          }}
        >
          <input
            name="q"
            defaultValue={search.q}
            placeholder="Search apps…"
            className="h-9 px-3 rounded-lg border border-input bg-background text-sm w-64"
          />
          <Button type="submit" size="sm">
            Search
          </Button>
          <Link to="/explore" search={{ ...search, sort: "recent" }}>
            <Button size="sm" variant={search.sort === "recent" ? "default" : "outline"}>
              Recent
            </Button>
          </Link>
          <Link to="/explore" search={{ ...search, sort: "popular" }}>
            <Button size="sm" variant={search.sort === "popular" ? "default" : "outline"}>
              Popular
            </Button>
          </Link>
        </form>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p: any) => {
            const shareHref =
              p.username && p.slug
                ? `/p/${p.username}/${p.slug}`
                : p.deployed_url || p.preview_url || null;
            const inner = (
              <>
                <div className="font-semibold truncate">{p.name}</div>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {p.description || "No description"}
                </p>
                <div className="text-xs text-muted-foreground mt-3">
                  {p.username ? `@${p.username} · ` : ""}
                  {p.framework} · {p.star_count ?? 0} stars
                </div>
              </>
            );
            if (p.username && p.slug) {
              return (
                <Link
                  key={p.id}
                  to="/p/$username/$projectSlug"
                  params={{ username: p.username, projectSlug: p.slug }}
                  className="rounded-xl border border-border p-4 hover:border-violet-500/40 transition-colors block"
                >
                  {inner}
                </Link>
              );
            }
            if (shareHref) {
              return (
                <a
                  key={p.id}
                  href={shareHref}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-border p-4 hover:border-violet-500/40 transition-colors block"
                >
                  {inner}
                </a>
              );
            }
            return (
              <div key={p.id} className="rounded-xl border border-border p-4 opacity-80">
                {inner}
              </div>
            );
          })}
          {projects.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full text-center">
              No public projects found.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
