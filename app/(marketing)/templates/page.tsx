// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Zap, GitFork, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Templates — LifemarkAI",
  description: "Start faster with professionally designed templates for your next app.",
};

export const revalidate = 300;

const CATEGORIES = ["All", "Landing Page", "Dashboard", "SaaS", "E-commerce", "Blog", "Portfolio"];

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const supabase = await createClient();
  const category = searchParams.category ?? "";

  let query = (supabase as any)
    .from("templates")
    .select("id, name, description, framework, preview_url, fork_count, tags")
    .order("fork_count", { ascending: false })
    .limit(48);

  if (category && category !== "All") {
    query = query.contains("tags", [category]);
  }

  const { data: templates } = await query;
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="pt-28 pb-12 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-6">
          <Zap className="w-3.5 h-3.5" />
          <span>Professionally designed, AI-ready</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Start with a Template
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Pick a template and let AI customize it to your exact needs. No blank page anxiety.
        </p>
      </div>

      {/* Category filter */}
      <div className="max-w-7xl mx-auto px-6 mb-8">
        <div className="flex flex-wrap gap-2 justify-center">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href={cat === "All" ? "/templates" : `/templates?category=${encodeURIComponent(cat)}`}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                (cat === "All" && !category) || category === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-accent"
              }`}
            >
              {cat}
            </Link>
          ))}
        </div>
      </div>

      {/* Template grid */}
      <div className="max-w-7xl mx-auto px-6 pb-24">
        {!templates || templates.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <div className="text-5xl mb-4">🎨</div>
            <p className="text-lg font-medium text-foreground mb-2">No templates yet</p>
            <p>Check back soon — we&apos;re adding new templates regularly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {templates.map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} isLoggedIn={!!user} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  isLoggedIn,
}: {
  template: {
    id: string;
    name: string;
    description: string | null;
    framework: string | null;
    preview_url: string | null;
    fork_count: number | null;
    tags: string[] | null;
  };
  isLoggedIn: boolean;
}) {
  return (
    <div className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all duration-200">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {template.preview_url ? (
          <iframe
            src={template.preview_url}
            className="w-full h-full scale-[0.5] origin-top-left pointer-events-none"
            style={{ width: "200%", height: "200%" }}
            sandbox="allow-scripts"
            loading="lazy"
            title={template.name}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-4xl">🎨</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {template.preview_url && (
          <a
            href={template.preview_url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-sm truncate">{template.name}</h3>
          {template.fork_count != null && template.fork_count > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <GitFork className="w-3 h-3" />
              {template.fork_count}
            </span>
          )}
        </div>

        {template.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {template.description}
          </p>
        )}

        {template.tags && template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {template.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded bg-accent text-xs text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}

        <form action="/api/projects" method="POST">
          <input type="hidden" name="templateId" value={template.id} />
          <input type="hidden" name="name" value={`${template.name} clone`} />
          <Button
            type="submit"
            size="sm"
            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white"
          >
            <GitFork className="w-3.5 h-3.5 mr-1.5" />
            {isLoggedIn ? "Use template" : "Sign up to use"}
          </Button>
        </form>
      </div>
    </div>
  );
}
