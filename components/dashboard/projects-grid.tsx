"use client";

import { useState, useMemo, useEffect } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MoreHorizontal, Globe, Github, Rocket, Clock, Lock,
  Archive, Trash2, ExternalLink, Code2, FolderOpen, Download,
  Search, SortAsc, X, Copy, Loader2, Star, FileText, ChevronDown,
  CheckSquare, Square, CheckCheck, LayoutTemplate, Zap, StickyNote,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Project } from "@/types/database";
import { GitHubImportModal } from "@/components/dashboard/github-import-modal";
import { ProjectThumbnail } from "@/components/dashboard/project-thumbnail";

interface ProjectsGridProps {
  projects: Project[];
}

type SortKey = "updated" | "created" | "name" | "deploys" | "oldest" | "popular";
type StatusFilter = "all" | "live" | "building" | "draft";

const frameworkColors: Record<string, string> = {
  react:  "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  next:   "bg-black/20 text-slate-300 border-slate-500/20",
  vue:    "bg-green-500/10 text-green-400 border-green-500/20",
  svelte: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function computeHealth(project: Project): { score: number; color: string; label: string } {
  let score = 0;
  const daysSinceUpdate = (Date.now() - new Date(project.updated_at).getTime()) / 86_400_000;

  if (project.deployed_url)              score += 40; // deployed
  if (daysSinceUpdate < 7)              score += 25; // active this week
  else if (daysSinceUpdate < 30)        score += 10; // active this month
  if (project.status === "active")      score += 20; // build succeeded
  if ((project.total_views ?? 0) > 0)  score += 15; // has visitors

  const color = score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  const label = score >= 80 ? "Healthy" : score >= 50 ? "Fair" : "Needs attention";
  return { score, color, label };
}

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "updated", label: "Last updated" },
  { id: "created", label: "Newest first" },
  { id: "name",    label: "Name A–Z" },
  { id: "deploys",  label: "Deployed" },
  { id: "oldest",  label: "Oldest first" },
  { id: "popular", label: "Most active" },
];

type FrameworkFilter = "all" | "react" | "next" | "vue" | "svelte";
const FRAMEWORK_FILTERS: { id: FrameworkFilter; label: string }[] = [
  { id: "all",    label: "All" },
  { id: "react",  label: "React" },
  { id: "next",   label: "Next.js" },
  { id: "vue",    label: "Vue" },
  { id: "svelte", label: "Svelte" },
];

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all",      label: "All" },
  { id: "live",     label: "Live" },
  { id: "building", label: "Building" },
  { id: "draft",    label: "Draft" },
];

export function ProjectsGrid({ projects }: ProjectsGridProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [deletingId, setDeletingId]         = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId]   = useState<string | null>(null);
  const [deployingId, setDeployingId]       = useState<string | null>(null);
  const [starringId, setStarringId]         = useState<string | null>(null);
  const [localStars, setLocalStars]         = useState<Record<string, boolean>>({});
  const [search, setSearch]                 = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [frameworkFilter, setFrameworkFilter] = useState<FrameworkFilter>("all");
  const [sort, setSort]                     = useState<SortKey>("updated");
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>("all");

  // Merge server state with local optimistic star state
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
    if (frameworkFilter !== "all") list = list.filter((p) => p.framework === frameworkFilter);
    if (statusFilter === "live")     list = list.filter((p) => !!p.deployed_url);
    if (statusFilter === "building") list = list.filter((p) => p.status === "building");
    if (statusFilter === "draft")    list = list.filter((p) => !p.deployed_url && p.status !== "building");
    list.sort((a, b) => {
      // Starred projects always float to the top
      const aStarred = getStarred(a) ? 1 : 0;
      const bStarred = getStarred(b) ? 1 : 0;
      if (bStarred !== aStarred) return bStarred - aStarred;
      if (sort === "name")    return a.name.localeCompare(b.name);
      if (sort === "created") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === "deploys")  return (b.deployed_url ? 1 : 0) - (a.deployed_url ? 1 : 0);
      if (sort === "oldest")   return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sort === "popular")  return (b.total_views ?? 0) - (a.total_views ?? 0);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, search, sort, statusFilter, frameworkFilter, localStars]);

  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

  // Per-project sticky notes (stored in localStorage)
  const NOTES_KEY = "lifemark-project-notes";
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(NOTES_KEY) ?? "{}"); }
    catch { return {}; }
  });
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");

  function openNote(projectId: string, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setNoteInput(notes[projectId] ?? "");
    setNoteOpenId((prev) => prev === projectId ? null : projectId);
  }

  function saveNote(projectId: string) {
    setNotes((prev) => {
      const next = { ...prev };
      if (noteInput.trim()) next[projectId] = noteInput.trim();
      else delete next[projectId];
      try { localStorage.setItem(NOTES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setNoteOpenId(null);
  }

  // Per-project color labels (stored in localStorage)
  const COLORS_KEY = "lifemark-project-colors";
  const COLOR_PRESETS = [
    { id: "red",    bg: "bg-red-500" },
    { id: "orange", bg: "bg-orange-500" },
    { id: "yellow", bg: "bg-yellow-400" },
    { id: "green",  bg: "bg-green-500" },
    { id: "blue",   bg: "bg-blue-500" },
    { id: "purple", bg: "bg-violet-500" },
    { id: "pink",   bg: "bg-pink-500" },
    { id: "gray",   bg: "bg-slate-400" },
  ];
  const [colorLabels, setColorLabels] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(COLORS_KEY) ?? "{}"); }
    catch { return {}; }
  });
  const [colorPickerOpenId, setColorPickerOpenId] = useState<string | null>(null);

  function setProjectColor(projectId: string, colorId: string | null) {
    setColorLabels((prev) => {
      const next = { ...prev };
      if (colorId) next[projectId] = colorId;
      else delete next[projectId];
      try { localStorage.setItem(COLORS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setColorPickerOpenId(null);
  }

  // Escape key clears selection
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(new Set());
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkArchive() {
    setBulkWorking(true);
    try {
      await Promise.all([...selected].map((id) =>
        fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        })
      ));
      setSelected(new Set());
      router.refresh();
    } finally { setBulkWorking(false); }
  }

  async function bulkDelete() {
    const ok = await confirm({
      title: `Delete ${selected.size} project${selected.size > 1 ? "s" : ""}?`,
      description: "These projects and all their files will be permanently deleted. This cannot be undone.",
      confirmLabel: "Delete all",
      variant: "destructive",
    });
    if (!ok) return;
    setBulkWorking(true);
    try {
      await Promise.all([...selected].map((id) =>
        fetch(`/api/projects/${id}`, { method: "DELETE" })
      ));
      setSelected(new Set());
      router.refresh();
    } finally { setBulkWorking(false); }
  }

  async function handleArchive(projectId: string, archive: boolean) {
    setArchivingId(projectId);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: archive ? "archived" : "active" }),
      });
      router.refresh();
    } finally {
      setArchivingId(null);
    }
  }

  async function handleDelete(projectId: string) {
    const ok = await confirm({
      title: "Delete project?",
      description: "This will permanently delete the project and all its files. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setDeletingId(projectId);
    try {
      await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDuplicate(project: Project) {
    setDuplicatingId(project.id);
    try {
      const filesRes = await fetch(`/api/projects/${project.id}/files`);
      const files: Array<{ path: string; content: string; language: string }> =
        filesRes.ok ? await filesRes.json() : [];

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Copy of ${project.name}`,
          description: project.description ?? "",
          framework: project.framework,
          forkFiles: files,
        }),
      });
      if (res.ok) {
        const newProject = await res.json();
        router.push(`/editor/${newProject.id}`);
      }
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleQuickDeploy(project: Project, e: React.MouseEvent) {
    e.stopPropagation();
    if (deployingId === project.id) return;
    setDeployingId(project.id);
    try {
      await fetch(`/api/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      router.refresh();
    } finally {
      setDeployingId(null);
    }
  }

  async function handleStar(project: Project, e: React.MouseEvent) {
    e.stopPropagation();
    if (starringId === project.id) return;
    const newStarred = !getStarred(project);
    // Optimistic update
    setLocalStars((prev) => ({ ...prev, [project.id]: newStarred }));
    setStarringId(project.id);
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_starred: newStarred }),
      });
    } catch {
      // Revert on error
      setLocalStars((prev) => ({ ...prev, [project.id]: !newStarred }));
    } finally {
      setStarringId(null);
    }
  }

  if (!projects.length) {
    return (
      <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-6">
          <FolderOpen className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
        <p className="text-muted-foreground mb-8 max-w-sm">
          Describe your app and let AI build it, or jump-start with a ready-made template.
        </p>
        {/* Action cards */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push("/templates")}
            className="w-56 flex flex-col items-center gap-2 px-6 py-5 rounded-xl bg-violet-500/10 border border-violet-500/25 hover:border-violet-500/50 hover:bg-violet-500/15 transition-all text-center"
          >
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <LayoutTemplate className="w-5 h-5 text-violet-400" />
            </div>
            <span className="text-sm font-semibold text-violet-300">Start from a template</span>
            <span className="text-xs text-muted-foreground">25+ production-ready starters</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowImportModal(true)}
            className="w-56 flex flex-col items-center gap-2 px-6 py-5 rounded-xl bg-card border border-border/50 hover:border-border hover:bg-accent/50 transition-all text-center"
          >
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Github className="w-5 h-5 text-muted-foreground" />
            </div>
            <span className="text-sm font-semibold">Import from GitHub</span>
            <span className="text-xs text-muted-foreground">Bring in an existing repo</span>
          </motion.button>
        </div>
      </motion.div>
      <GitHubImportModal open={showImportModal} onOpenChange={setShowImportModal} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="h-9 pl-9 pr-8 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                statusFilter === f.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {FRAMEWORK_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFrameworkFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                frameworkFilter === f.id
                  ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 text-xs ml-auto">
              <SortAsc className="w-3.5 h-3.5" />
              {SORT_OPTIONS.find((s) => s.id === sort)?.label}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SORT_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.id}
                onClick={() => setSort(opt.id)}
                className={`text-xs ${sort === opt.id ? "bg-accent" : ""}`}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {(search || statusFilter !== "all") && (
          <span className="text-xs text-muted-foreground">
            {filtered.length} of {projects.length}
          </span>
        )}
      </div>

      {/* Empty filtered state */}
      {filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <Search className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No projects match your search</p>
          <button
            onClick={() => { setSearch(""); setStatusFilter("all"); }}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        </motion.div>
      )}

      {/* Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <AnimatePresence>
          {filtered.map((project, i) => {
            const isStarred = getStarred(project);
            return (
              <motion.div
                key={project.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className={`group relative bg-card border rounded-xl overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer ${
                  selected.has(project.id) ? "border-primary ring-1 ring-primary/40 shadow-primary/10" :
                  isStarred ? "border-yellow-500/30 shadow-yellow-500/5" : "border-border hover:border-border/60"
                } ${deletingId === project.id || duplicatingId === project.id ? "opacity-50" : ""}`}
                onClick={() => router.push(`/editor/${project.id}`)}
              >
                {/* Preview thumbnail */}
                <div className="h-32 relative overflow-hidden">
                  <ProjectThumbnail
                    name={project.name}
                    framework={(project as any).framework}
                    previewUrl={project.preview_url}
                    deployedUrl={(project as any).deployed_url}
                  />

                  {/* Select checkbox — top-left of thumbnail */}
                  <button
                    onClick={(e) => toggleSelect(project.id, e)}
                    className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center transition-all z-10 ${
                      selected.has(project.id)
                        ? "bg-primary text-primary-foreground opacity-100"
                        : "bg-black/30 text-white/60 opacity-0 group-hover:opacity-100"
                    }`}
                    title="Select project"
                  >
                    {selected.has(project.id)
                      ? <CheckSquare className="w-3.5 h-3.5" />
                      : <Square className="w-3.5 h-3.5" />
                    }
                  </button>

                  {/* Star button — moved to bottom-left when not selected */}
                  <button
                    onClick={(e) => handleStar(project, e)}
                    className={`absolute top-2 ${selected.has(project.id) ? "left-9" : "left-9"} w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      isStarred
                        ? "bg-yellow-500/20 text-yellow-400 opacity-100"
                        : "bg-black/30 text-white/40 opacity-0 group-hover:opacity-100 hover:text-yellow-400"
                    }`}
                    title={isStarred ? "Unstar" : "Star project"}
                  >
                    <Star className={`w-3 h-3 ${isStarred ? "fill-yellow-400" : ""}`} />
                  </button>

                  {/* Color label dot + picker */}
                  <div
                    className="absolute top-2 right-10 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setColorPickerOpenId((prev) => prev === project.id ? null : project.id); }}
                      className={`w-4 h-4 rounded-full border border-white/20 transition-all ${colorLabels[project.id] ? COLOR_PRESETS.find((c) => c.id === colorLabels[project.id])?.bg ?? "" : "opacity-0 group-hover:opacity-60 bg-white/20"}`}
                      title="Set color label"
                    />
                    {colorPickerOpenId === project.id && (
                      <div
                        className="absolute top-6 right-0 z-50 flex gap-1 p-1.5 rounded-lg bg-popover border border-border shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setProjectColor(project.id, colorLabels[project.id] === c.id ? null : c.id)}
                            className={`w-4 h-4 rounded-full ${c.bg} transition-transform hover:scale-110 ${colorLabels[project.id] === c.id ? "ring-2 ring-white ring-offset-1 ring-offset-popover" : ""}`}
                            title={c.id}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="absolute top-2 right-2">
                    {project.status === "building" && (
                      <div className="flex items-center gap-1.5 text-xs bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                        Building
                      </div>
                    )}
                    {project.deployed_url && (
                      <div className="flex items-center gap-1.5 text-xs bg-green-500/10 border border-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                        <Globe className="w-3 h-3" />
                        Live
                      </div>
                    )}
                    {project.deployed_url && (project as any).visibility && (project as any).visibility !== "public" && (
                      <div className="flex items-center gap-1 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
                        <Lock className="w-2.5 h-2.5" />
                        {(project as any).visibility === "private" ? "Private" : "Workspace"}
                      </div>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-semibold text-sm truncate flex-1 mr-2">{project.name}</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity -mr-1">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => router.push(`/editor/${project.id}`)}>
                          <Code2 className="w-4 h-4 mr-2" /> Open editor
                        </DropdownMenuItem>
                        {project.deployed_url && (
                          <DropdownMenuItem onClick={() => window.open(project.deployed_url!, "_blank")}>
                            <ExternalLink className="w-4 h-4 mr-2" /> View live
                          </DropdownMenuItem>
                        )}
                        {project.github_repo && (
                          <DropdownMenuItem onClick={() => window.open(`https://github.com/${project.github_repo}`, "_blank")}>
                            <Github className="w-4 h-4 mr-2" /> GitHub repo
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => handleStar(project, e)}>
                          <Star className={`w-4 h-4 mr-2 ${isStarred ? "fill-yellow-400 text-yellow-400" : ""}`} />
                          {isStarred ? "Unstar" : "Star"} project
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => void handleQuickDeploy(project, e)}
                          disabled={deployingId === project.id}
                        >
                          {deployingId === project.id
                            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            : <Zap className="w-4 h-4 mr-2 text-amber-400" />}
                          Quick deploy
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = `/api/projects/${project.id}/export`;
                            a.download = "";
                            a.click();
                          }}
                        >
                          <Download className="w-4 h-4 mr-2" /> Download ZIP
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDuplicate(project)}
                          disabled={!!duplicatingId}
                        >
                          {duplicatingId === project.id
                            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            : <Copy className="w-4 h-4 mr-2" />}
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => void handleArchive(project.id, true)}
                          disabled={archivingId === project.id}
                        >
                          {archivingId === project.id
                            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            : <Archive className="w-4 h-4 mr-2" />}
                          Archive
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDelete(project.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {project.description && (
                    <p className="text-xs text-muted-foreground truncate mb-3">{project.description}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={`text-xs ${frameworkColors[project.framework] ?? ""}`}>
                      {project.framework}
                    </Badge>
                    <div className="flex items-center gap-2">
                      {/* Sticky note icon */}
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => openNote(project.id, e)}
                          className={`p-0.5 rounded transition-colors ${notes[project.id] ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100"}`}
                          title={notes[project.id] ? notes[project.id] : "Add a note"}
                        >
                          <StickyNote className={`w-3.5 h-3.5 ${notes[project.id] ? "fill-amber-400/30" : ""}`} />
                        </button>
                        {noteOpenId === project.id && (
                          <div
                            className="absolute bottom-full right-0 mb-2 z-50 w-56 rounded-lg border border-border bg-popover shadow-lg p-2 space-y-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="text-[10px] text-muted-foreground font-medium px-0.5">Project note</p>
                            <input
                              autoFocus
                              maxLength={120}
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveNote(project.id);
                                if (e.key === "Escape") setNoteOpenId(null);
                              }}
                              placeholder="Add a private note…"
                              className="w-full text-xs bg-muted/50 border border-border rounded px-2 py-1 outline-none focus:border-violet-500/50 placeholder:text-muted-foreground/40"
                            />
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => setNoteOpenId(null)} className="text-[10px] px-2 py-0.5 rounded hover:bg-muted transition-colors text-muted-foreground">Cancel</button>
                              <button onClick={() => saveNote(project.id)} className="text-[10px] px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-500 text-white transition-colors">Save</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Health score dot */}
                      {(() => {
                        const h = computeHealth(project);
                        return (
                          <div className="flex items-center gap-1" title={h.label + " · " + String(h.score) + "/100"}>
                            <span className={"w-1.5 h-1.5 rounded-full " + h.color} />
                            <span className="text-[10px] text-muted-foreground font-mono">{h.score}</span>
                          </div>
                        );
                      })()}
                      {(() => {
                        const fc = (project as any).project_files?.[0]?.count;
                        return fc != null && fc > 0 ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText className="w-3 h-3" />
                            <span>{fc}</span>
                          </div>
                        ) : null;
                      })()}
                      {project.deployed_url && (
                        <div className="flex items-center gap-1 text-xs text-green-500/70" title="Last deployed">
                          <Rocket className="w-3 h-3" />
                          {timeAgo(project.updated_at)}
                        </div>
                      )}
                      {!project.deployed_url && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {timeAgo(project.updated_at)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* Hover quick-stats overlay — slides up within card */}
                <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-200 ease-out bg-card/95 backdrop-blur-sm border-t border-border p-3 pointer-events-none">
                  <div className="space-y-1.5">
                    {/* Framework + live status row */}
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={"text-[10px] py-0 " + (frameworkColors[project.framework] ?? "")}>
                        {project.framework}
                      </Badge>
                      {project.deployed_url ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-400" title="Deployed">
                          <Rocket className="w-2.5 h-2.5" />
                          Deployed {timeAgo(project.updated_at)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Not deployed</span>
                      )}
                    </div>
                    {/* Description */}
                    {project.description && (
                      <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {project.description}
                      </p>
                    )}
                    {/* File count + health */}
                    <div className="flex items-center justify-between pt-0.5">
                      {(() => {
                        const fc = (project as any).project_files?.[0]?.count;
                        return (
                          <span className="text-[10px] text-muted-foreground">
                            {fc != null && fc > 0 ? fc + " files" : "No files"}
                          </span>
                        );
                      })()}
                      {(() => {
                        const h = computeHealth(project);
                        return (
                          <span className={"text-[10px] font-medium " + h.color.replace("bg-", "text-")}>
                            {h.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Bulk action floating bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-card border border-border rounded-2xl shadow-2xl shadow-black/20"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <CheckCheck className="w-4 h-4 text-primary" />
              {selected.size} selected
            </span>
            <div className="w-px h-5 bg-border" />
            <button
              onClick={() => void bulkArchive()}
              disabled={bulkWorking}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
            <button
              onClick={() => void bulkDelete()}
              disabled={bulkWorking}
              className="flex items-center gap-1.5 text-sm text-destructive/80 hover:text-destructive transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
            <div className="w-px h-5 bg-border" />
            <button
              onClick={() => setSelected(new Set())}
              disabled={bulkWorking}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Clear selection (Esc)"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <GitHubImportModal
        open={showImportModal}
        onOpenChange={(open) => { setShowImportModal(open); if (!open) router.refresh(); }}
      />
    </div>
  );
}
