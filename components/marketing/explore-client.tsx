"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Search, Filter, Globe, GitFork, Sparkles,
  ExternalLink, Clock, TrendingUp, Layers,
  FolderOpen, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  deployed_url: string | null;
  preview_url?: string | null;
  created_at: string;
  user_id: string;
  slug: string | null;
  star_count?: number;
  owner_username?: string | null;
}

/** Showcase URL for a project, or null when it can't be linked (no owner/slug). */
function showcaseHref(p: { owner_username?: string | null; slug: string | null }): string | null {
  return p.owner_username && p.slug ? `/p/${p.owner_username}/${p.slug}` : null;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  preview_url: string | null;
  fork_count: number;
  tags: string[] | null;
}

interface ExploreClientProps {
  projects: Project[];
  templates: Template[];
  trendingProjects: Project[];
  viewCounts: Record<string, number>;
  userId: string | null;
  initialQuery: string;
  initialFramework: string;
  initialSort: string;
  initialStarred: string[];
}

const FRAMEWORKS = ["", "react", "nextjs", "vue", "svelte"];
const FRAMEWORK_LABELS: Record<string, string> = {
  "": "All frameworks",
  react: "React",
  nextjs: "Next.js",
  vue: "Vue",
  svelte: "Svelte",
};

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function frameworkColor(fw: string): string {
  const map: Record<string, string> = {
    react: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    nextjs: "bg-slate-500/20 text-slate-300 border-slate-500/30",
    vue: "bg-green-500/20 text-green-400 border-green-500/30",
    svelte: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  };
  return map[fw] ?? "bg-muted text-muted-foreground border-border";
}

export function ExploreClient({
  projects,
  templates,
  trendingProjects,
  viewCounts,
  userId,
  initialQuery,
  initialFramework,
  initialSort,
  initialStarred,
}: ExploreClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [framework, setFramework] = useState(initialFramework);
  const [sort, setSort] = useState(initialSort);
  const [forking, setForking] = useState<string | null>(null);
  const [tab, setTab] = useState<"community" | "templates">("community");
  const [starred, setStarred] = useState<Set<string>>(() => new Set(initialStarred));
  const [starring, setStarring] = useState<string | null>(null);
  const [starCounts, setStarCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(projects.map((p) => [p.id, p.star_count ?? 0]))
  );
  const { toast } = useToast();

  async function toggleStar(projectId: string) {
    if (!userId) { router.push("/login"); return; }
    setStarring(projectId);
    try {
      const res = await fetch(`/api/projects/${projectId}/star`, { method: "POST" });
      const data = await res.json() as { starred: boolean; count: number; error?: string };
      if (!res.ok) throw new Error(data.error);
      setStarred((prev) => {
        const next = new Set(prev);
        data.starred ? next.add(projectId) : next.delete(projectId);
        return next;
      });
      setStarCounts((prev) => ({ ...prev, [projectId]: data.count }));
    } catch {
      toast({ title: "Could not star project", variant: "destructive" });
    } finally {
      setStarring(null);
    }
  }

  function applyFilters(q: string, fw: string, s: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (fw) params.set("framework", fw);
    if (s !== "recent") params.set("sort", s);
    router.push(`/explore${params.toString() ? `?${params.toString()}` : ""}`);
  }

  async function forkProject(projectId: string, name: string) {
    if (!userId) {
      router.push("/login");
      return;
    }
    setForking(projectId);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${name} (fork)`, templateId: null, forkOf: projectId }),
      });
      const data = await res.json() as { id: string; error?: string };
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Forked!", description: `"${name}" copied to your projects.` });
      router.push(`/editor/${data.id}`);
    } catch (err) {
      toast({ title: "Fork failed", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    } finally {
      setForking(null);
    }
  }

  async function forkTemplate(templateId: string, name: string) {
    if (!userId) { router.push("/login"); return; }
    setForking(templateId);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, templateId }),
      });
      const data = await res.json() as { id: string; error?: string };
      if (!res.ok) throw new Error(data.error);
      router.push(`/editor/${data.id}`);
    } catch {
      toast({ title: "Fork failed", variant: "destructive" });
    } finally {
      setForking(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero bar */}
      <div className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Logo / back */}
            <a href="/" className="text-sm font-semibold text-violet-400 hover:text-violet-300 transition-colors shrink-0">
              LifemarkAI
            </a>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-semibold">Explore</span>

            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search apps…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters(query, framework, sort)}
                className="pl-8 h-9 text-sm"
              />
            </div>

            {/* Framework filter */}
            <select
              value={framework}
              onChange={(e) => { setFramework(e.target.value); applyFilters(query, e.target.value, sort); }}
              className="h-9 rounded-lg border border-border bg-background text-sm px-2 pr-6 text-foreground"
            >
              {FRAMEWORKS.map((fw) => (
                <option key={fw} value={fw}>{FRAMEWORK_LABELS[fw]}</option>
              ))}
            </select>

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); applyFilters(query, framework, e.target.value); }}
              className="h-9 rounded-lg border border-border bg-background text-sm px-2 pr-6 text-foreground"
            >
              <option value="recent">Most recent</option>
              <option value="popular">Most popular ⭐</option>
              <option value="az">A–Z</option>
            </select>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-3">
            {(["community", "templates"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-sm font-medium pb-2 border-b-2 transition-colors capitalize ${
                  tab === t
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "community" ? `Community (${projects.length})` : `Templates (${templates.length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {tab === "community" ? (
          <>
          {/* Trending this week rail */}
          {trendingProjects.length > 0 && !query && !framework && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold">Trending this week</h2>
                <span className="text-[10px] text-muted-foreground ml-1">most viewed in the last 7 days</span>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                {trendingProjects.map((project, i) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="group flex-shrink-0 w-64 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 hover:border-amber-500/60 transition-all overflow-hidden cursor-pointer"
                    onClick={() => {
                      const sc = showcaseHref(project);
                      if (sc) router.push(sc);
                      else if (project.deployed_url) window.open(project.deployed_url, "_blank");
                      else router.push(`/editor/${project.id}`);
                    }}
                  >
                    {/* Preview thumbnail */}
                    <div className="h-28 bg-gradient-to-br from-amber-500/10 to-orange-500/10 flex items-center justify-center border-b border-amber-500/20 relative overflow-hidden">
                      {project.preview_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={project.preview_url} alt={project.name} className="w-full h-full object-cover" />
                      ) : project.deployed_url ? (
                        <iframe
                          src={project.deployed_url}
                          className="absolute inset-0 pointer-events-none"
                          style={{ width: "133%", height: "133%", transform: "scale(0.75)", transformOrigin: "top left" }}
                          sandbox="allow-scripts allow-same-origin"
                          title={project.name}
                        />
                      ) : (
                        <FolderOpen className="w-8 h-8 text-amber-400/40" />
                      )}
                      {/* Rank badge */}
                      <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-amber-500/90 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                        {i + 1}
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
                    </div>
                    <div className="p-2.5 space-y-1.5">
                      <p className="text-sm font-semibold truncate">{project.name}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${frameworkColor(project.framework)}`}>
                          {project.framework}
                        </span>
                        <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <TrendingUp className="w-2.5 h-2.5" />
                          {viewCounts[project.id] ?? 0} views
                        </span>
                        {sort === "popular" && (starCounts[project.id] ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                            ⭐ {starCounts[project.id]}
                          </span>
                        )}
                        {project.deployed_url && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30">
                            Live
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {projects.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-28 text-center"
            >
              {/* Animated illustration */}
              <div className="relative mb-8">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center">
                  <Globe className="w-10 h-10 text-violet-400/60" />
                </div>
                <motion.div
                  animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-2xl bg-violet-500/10"
                />
              </div>
              <p className="text-xl font-semibold mb-2">
                {query || framework ? "No matching projects" : "No public projects yet"}
              </p>
              <p className="text-sm text-muted-foreground mb-8 max-w-sm">
                {query || framework
                  ? "Try adjusting your search or clearing the filters."
                  : "Be the first to make a project public and inspire the community."}
              </p>
              <div className="flex items-center gap-3">
                {(query || framework) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      router.push("/explore");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
                {userId && (
                  <Button onClick={() => router.push("/dashboard")} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Build something
                  </Button>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {projects.map((project, i) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4) }}
                  className="group rounded-2xl border border-border bg-card hover:border-violet-500/40 transition-all overflow-hidden"
                >
                  {/* Preview thumbnail */}
                  <div className="h-36 bg-gradient-to-br from-violet-500/10 to-blue-500/10 flex items-center justify-center border-b border-border relative overflow-hidden">
                    {project.preview_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={project.preview_url} alt={project.name} className="w-full h-full object-cover" />
                    ) : project.deployed_url ? (
                      <iframe
                        src={project.deployed_url}
                        className="w-full h-full scale-75 origin-top-left absolute inset-0 pointer-events-none"
                        style={{ width: "133%", height: "133%" }}
                        sandbox="allow-scripts allow-same-origin"
                        title={project.name}
                      />
                    ) : (
                      <FolderOpen className="w-10 h-10 text-violet-400/40" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
                    {showcaseHref(project) && (
                      <Link
                        href={showcaseHref(project)!}
                        className="absolute inset-0 z-10"
                        aria-label={`View ${project.name}`}
                      />
                    )}
                  </div>

                  <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {showcaseHref(project) ? (
                          <Link
                            href={showcaseHref(project)!}
                            className="text-sm font-semibold truncate block hover:text-violet-400 transition-colors"
                          >
                            {project.name}
                          </Link>
                        ) : (
                          <p className="text-sm font-semibold truncate">{project.name}</p>
                        )}
                        {project.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {project.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${frameworkColor(project.framework)}`}>
                        {project.framework}
                      </span>
                      {project.deployed_url && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30">
                          Live
                        </span>
                      )}
                      {sort === "popular" && (starCounts[project.id] ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                          ⭐ {starCounts[project.id]}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {relativeTime(project.created_at)}
                      </span>
                    </div>

                    <div className="flex gap-2 pt-1">
                      {project.deployed_url && (
                        <a
                          href={project.deployed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1"
                        >
                          <Button variant="outline" size="sm" className="w-full h-7 gap-1 text-xs">
                            <ExternalLink className="w-3 h-3" />
                            View
                          </Button>
                        </a>
                      )}
                      <Button
                        size="sm"
                        className="flex-1 h-7 gap-1 text-xs bg-gradient-to-r from-violet-500 to-blue-500 text-white hover:opacity-90"
                        onClick={() => void forkProject(project.id, project.name)}
                        disabled={forking === project.id}
                      >
                        <GitFork className="w-3 h-3" />
                        {forking === project.id ? "Forking…" : "Fork"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 gap-1 text-xs px-2 shrink-0 transition-colors ${
                          starred.has(project.id)
                            ? "border-amber-500/60 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                            : "hover:border-amber-500/40 hover:text-amber-400"
                        }`}
                        onClick={() => void toggleStar(project.id)}
                        disabled={starring === project.id}
                        title={starred.has(project.id) ? "Unstar" : "Star this project"}
                      >
                        <Star className={`w-3 h-3 ${starred.has(project.id) ? "fill-amber-400 text-amber-400" : ""}`} />
                        {(starCounts[project.id] ?? 0) > 0 && (
                          <span>{starCounts[project.id]}</span>
                        )}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          </>
        ) : (
          /* Templates tab */
          templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Layers className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-semibold">No templates yet</p>
              <p className="text-sm text-muted-foreground mt-1">Check back soon for community templates.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <div key={template.id} className="rounded-xl border border-border bg-card overflow-hidden hover:border-violet-500/40 transition-all group">
                  <div className="aspect-video bg-muted/30 relative overflow-hidden">
                    {template.preview_url && (
                      <img src={template.preview_url} alt={template.name} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-sm font-semibold truncate">{template.name}</p>
                    {template.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${frameworkColor(template.framework)}`}>
                        {template.framework}
                      </span>
                      {(template.fork_count ?? 0) > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          🍴 {template.fork_count}
                        </span>
                      )}
                    </div>
                    <Button size="sm" className="w-full h-7 text-xs gap-1.5" onClick={() => void forkTemplate(template.id, template.name)}>
                      <GitFork className="w-3 h-3" /> Use template
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
