/**
 * Shell ProjectsGrid — lean port for the TanStack Start app.
 * Full Next grid (GitHub import modal, dropdown menus, thumbnails) stays on :3000;
 * this keeps the dashboard project browser working via proxied /api/projects.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Clock, FolderOpen, Globe, Search, Star, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Project } from "@/types/database";

interface ProjectsGridProps {
  projects: Project[];
  emphasizeViews?: boolean;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ProjectsGrid({ projects, emphasizeViews = false }: ProjectsGridProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [starringId, setStarringId] = useState<string | null>(null);
  const [localStars, setLocalStars] = useState<Record<string, boolean>>({});

  const getStarred = (p: Project) => localStars[p.id] ?? p.is_starred ?? false;

  const filtered = useMemo(() => {
    let list = projects.filter((p) => p.status !== "archived");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q) ||
          (p.framework ?? "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const aStar = getStarred(a) ? 1 : 0;
      const bStar = getStarred(b) ? 1 : 0;
      if (bStar !== aStar) return bStar - aStar;
      if (emphasizeViews) return (b.total_views ?? 0) - (a.total_views ?? 0);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [projects, search, localStars, emphasizeViews]);

  async function handleStar(project: Project, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (starringId === project.id) return;
    const next = !getStarred(project);
    setLocalStars((prev) => ({ ...prev, [project.id]: next }));
    setStarringId(project.id);
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_starred: next }),
      });
      void router.invalidate();
    } catch {
      setLocalStars((prev) => ({ ...prev, [project.id]: !next }));
    } finally {
      setStarringId(null);
    }
  }

  if (!projects.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <FolderOpen className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No projects yet</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          Describe your app on the dashboard, or start from a template.
        </p>
        <Link to="/templates">
          <Button size="sm">Browse templates</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          className="h-9 pl-9 pr-8 text-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No projects match your search</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((project) => {
            const starred = getStarred(project);
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => void navigate({ to: "/editor/$projectId", params: { projectId: project.id } })}
                className={`text-left rounded-xl border bg-card p-4 hover:border-violet-500/40 transition-colors ${
                  starred ? "border-yellow-500/30" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-sm truncate">{project.name}</h3>
                  <button
                    type="button"
                    title={starred ? "Unstar" : "Star"}
                    onClick={(e) => void handleStar(project, e)}
                    className={`shrink-0 p-0.5 ${starred ? "text-yellow-400" : "text-muted-foreground/50 hover:text-yellow-400"}`}
                  >
                    <Star className={`w-3.5 h-3.5 ${starred ? "fill-yellow-400" : ""}`} />
                  </button>
                </div>
                {project.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{project.description}</p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-xs">
                    {project.framework ?? "react"}
                  </Badge>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {project.deployed_url && <Globe className="w-3 h-3 text-green-500" />}
                    {emphasizeViews && (project.total_views ?? 0) > 0 && (
                      <span>{(project.total_views ?? 0).toLocaleString()} views</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(project.updated_at)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
