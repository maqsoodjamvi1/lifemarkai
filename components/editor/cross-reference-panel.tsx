"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FolderOpen, FileCode, Search, ChevronRight, ChevronDown,
  Download, Sparkles, Loader2, Check, X, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface SlimProject {
  id: string;
  name: string;
  framework: string | null;
  updated_at: string;
  description: string | null;
}

interface SlimFile {
  id: string;
  path: string;
  language: string;
  content: string;
}

interface CrossReferencePanelProps {
  currentProjectId: string;
  onFilesUpdate: (files: ProjectFile[]) => void;
  /** When set, triggers AI-adapt flow by injecting a prompt into chat */
  onAdaptWithAI: (prompt: string) => void;
}

const FW_BADGE: Record<string, { label: string; color: string }> = {
  "next.js": { label: "Next", color: "bg-zinc-800 text-zinc-200" },
  nextjs:    { label: "Next", color: "bg-zinc-800 text-zinc-200" },
  react:     { label: "React", color: "bg-cyan-900 text-cyan-300" },
  vue:       { label: "Vue",   color: "bg-emerald-900 text-emerald-300" },
  svelte:    { label: "Svelte", color: "bg-orange-900 text-orange-300" },
  astro:     { label: "Astro", color: "bg-purple-900 text-purple-300" },
  vite:      { label: "Vite",  color: "bg-violet-900 text-violet-300" },
};

function fileIcon(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    tsx: "⚛", ts: "TS", jsx: "⚛", js: "JS",
    css: "🎨", scss: "🎨", json: "{ }", md: "📝",
    html: "🌐", py: "🐍", sql: "🗄",
  };
  return map[ext] ?? "📄";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ── File tree grouped by folder ──────────────────────────────────────────────
function groupByFolder(files: SlimFile[]): Record<string, SlimFile[]> {
  const groups: Record<string, SlimFile[]> = {};
  for (const f of files) {
    const parts = f.path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push(f);
  }
  return groups;
}

export function CrossReferencePanel({
  currentProjectId,
  onFilesUpdate,
  onAdaptWithAI,
}: CrossReferencePanelProps) {
  const { toast } = useToast();
  const [projects, setProjects] = useState<SlimProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [search, setSearch] = useState("");

  // Drill-down state
  const [activeProject, setActiveProject] = useState<SlimProject | null>(null);
  const [projectFiles, setProjectFiles] = useState<SlimFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Selection + preview
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<SlimFile | null>(null);

  // Import state
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  // Load projects (exclude current)
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: SlimProject[]) => {
        setProjects((data ?? []).filter((p) => p.id !== currentProjectId));
        setLoadingProjects(false);
      })
      .catch(() => setLoadingProjects(false));
  }, [currentProjectId]);

  const openProject = useCallback(async (project: SlimProject) => {
    setActiveProject(project);
    setSelected(new Set());
    setPreview(null);
    setFileSearch("");
    setExpandedFolders(new Set());
    setLoadingFiles(true);

    const res = await fetch(`/api/projects/${project.id}/files`);
    if (res.ok) {
      const files: SlimFile[] = await res.json();
      setProjectFiles(files);
      // Auto-expand first folder
      const groups = groupByFolder(files);
      const first = Object.keys(groups)[0];
      if (first) setExpandedFolders(new Set([first]));
    } else {
      toast({ title: "Failed to load files", variant: "destructive" });
    }
    setLoadingFiles(false);
  }, [toast]);

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const handleImport = async () => {
    if (!activeProject || selected.size === 0) return;
    setImporting(true);

    const res = await fetch(`/api/projects/${currentProjectId}/import-files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceProjectId: activeProject.id,
        filePaths: Array.from(selected),
      }),
    });

    if (res.ok) {
      const { imported: files } = await res.json();
      onFilesUpdate(files ?? []);
      setImported(true);
      setTimeout(() => setImported(false), 2500);
      toast({
        title: `${files?.length ?? selected.size} file(s) imported`,
        description: `From "${activeProject.name}" into current project`,
      });
      setSelected(new Set());
    } else {
      const { error } = await res.json();
      toast({ title: "Import failed", description: error, variant: "destructive" });
    }
    setImporting(false);
  };

  const handleAdaptWithAI = () => {
    if (!activeProject || selected.size === 0) return;
    const files = projectFiles.filter((f) => selected.has(f.path));
    const snippets = files.map((f) =>
      `// File: ${f.path}\n${f.content.slice(0, 800)}${f.content.length > 800 ? "\n// …" : ""}`
    ).join("\n\n");

    const prompt = `I want to import and adapt the following components from my project "${activeProject.name}" into this project. Please analyse the code, adapt it to fit this project's existing style and framework, and add it as new file(s):\n\n${snippets}`;
    onAdaptWithAI(prompt);
    toast({ title: "Prompt sent to AI", description: "Switch to Chat to see the adaptation" });
  };

  // ── Filtered project list ────────────────────────────────────────────────
  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Filtered files grouped by folder ────────────────────────────────────
  const filteredFiles = fileSearch
    ? projectFiles.filter((f) => f.path.toLowerCase().includes(fileSearch.toLowerCase()))
    : projectFiles;
  const grouped = groupByFolder(filteredFiles);
  const folders = Object.keys(grouped).sort();

  // ─────────────────────────────────────────────────────────────────────────
  // View: Project list
  if (!activeProject) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <FolderOpen className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Cross-Project</span>
        </div>

        <div className="px-3 pt-3 pb-2 shrink-0">
          <p className="text-[11px] text-muted-foreground mb-2">
            Browse your other projects and import components into this one.
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {loadingProjects ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                {search ? "No projects match your search" : "No other projects found"}
              </p>
            </div>
          ) : (
            filteredProjects.map((p) => {
              const fw = (p.framework ?? "react").toLowerCase();
              const badge = FW_BADGE[fw] ?? { label: p.framework ?? "App", color: "bg-muted text-muted-foreground" };
              return (
                <button
                  key={p.id}
                  onClick={() => openProject(p)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group flex items-center gap-2.5"
                >
                  <FolderOpen className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground truncate">{p.name}</span>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(p.updated_at)}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0" />
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // View: File browser inside a project
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <button
          onClick={() => { setActiveProject(null); setPreview(null); }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{activeProject.name}</p>
        </div>
        {selected.size > 0 && (
          <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
            {selected.size} selected
          </span>
        )}
      </div>

      {/* File search */}
      <div className="px-3 pt-2 pb-1.5 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={fileSearch}
            onChange={(e) => setFileSearch(e.target.value)}
            placeholder="Filter files…"
            className="pl-7 h-7 text-xs"
          />
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
        {loadingFiles ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex items-center justify-center h-24">
            <p className="text-xs text-muted-foreground">No files found</p>
          </div>
        ) : (
          folders.map((folder) => (
            <div key={folder}>
              {/* Folder row */}
              <button
                onClick={() => toggleFolder(folder)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {expandedFolders.has(folder)
                  ? <ChevronDown className="w-3 h-3 shrink-0" />
                  : <ChevronRight className="w-3 h-3 shrink-0" />
                }
                <span className="font-medium truncate">{folder}</span>
                <span className="ml-auto text-[10px] opacity-50">{grouped[folder].length}</span>
              </button>

              {/* Files in folder */}
              {expandedFolders.has(folder) && grouped[folder].map((file) => {
                const isSelected = selected.has(file.path);
                const isPreviewing = preview?.path === file.path;
                return (
                  <div
                    key={file.path}
                    className={`flex items-center gap-2 px-2 py-1.5 ml-4 rounded-md cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : isPreviewing
                        ? "bg-muted/60 text-foreground"
                        : "hover:bg-muted/40 text-foreground/80"
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(file.path)}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                    </button>

                    {/* File name — click to preview */}
                    <button
                      onClick={() => setPreview(isPreviewing ? null : file)}
                      className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    >
                      <span className="text-[10px] shrink-0">{fileIcon(file.path)}</span>
                      <span className="text-[11px] truncate">
                        {file.path.split("/").pop()}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Code preview */}
      {preview && (
        <div className="border-t border-border shrink-0 max-h-48 flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 shrink-0">
            <span className="text-[10px] font-mono text-muted-foreground truncate">{preview.path}</span>
            <button onClick={() => setPreview(null)} className="text-muted-foreground hover:text-foreground ml-2 shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
          <pre className="text-[9px] font-mono leading-relaxed text-muted-foreground overflow-auto p-3 flex-1">
            {preview.content.slice(0, 2000)}
            {preview.content.length > 2000 && "\n\n// … truncated"}
          </pre>
        </div>
      )}

      {/* Action bar */}
      {selected.size > 0 && (
        <div className="border-t border-border px-3 py-2.5 shrink-0 space-y-2">
          <p className="text-[10px] text-muted-foreground">
            {selected.size} file{selected.size > 1 ? "s" : ""} selected
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleAdaptWithAI}
              className="flex-1 h-7 text-xs gap-1.5"
            >
              <Sparkles className="w-3 h-3" />
              Adapt with AI
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importing}
              className="flex-1 h-7 text-xs gap-1.5"
            >
              {importing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : imported ? (
                <Check className="w-3 h-3" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              {imported ? "Imported!" : "Copy files"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            "Copy files" imports as-is. "Adapt with AI" lets the AI refactor them for this project.
          </p>
        </div>
      )}
    </div>
  );
}
