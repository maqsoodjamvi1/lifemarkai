"use client";

import { useState, useEffect } from "react";
import { Map, Plus, Trash2, ChevronRight, FileText, Loader2, Copy, Check, ArrowRight, Home, Globe, Lock, Sparkles, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface RouterWizardPanelProps {
  projectId: string;
  files: { path: string; content: string }[];
  onInsertCode: (prompt: string) => void;
}

interface PageNode {
  id: string;
  path: string;          // e.g. /dashboard, /dashboard/settings
  label: string;         // display name
  protected: boolean;    // requires auth
  layout?: string;       // parent layout
  description?: string;
}

const PATH_COLORS: Record<string, string> = {
  "/":                "text-violet-400",
  "/dashboard":       "text-sky-400",
  "/auth":            "text-amber-400",
  "/api":             "text-emerald-400",
  "/admin":           "text-red-400",
};

function getColor(path: string): string {
  const prefix = Object.keys(PATH_COLORS).find((k) => path.startsWith(k) && k !== "/");
  return prefix ? PATH_COLORS[prefix] : PATH_COLORS["/"];
}

function detectPagesFromFiles(files: { path: string; content: string }[]): PageNode[] {
  const pages: PageNode[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    // Match app router pages: app/**/page.tsx
    const match = file.path.match(/^app(\/[^/]+(?:\/[^/]+)*)?\/page\.tsx$/);
    if (!match) continue;

    const segment = match[1] ?? "";
    // Strip route groups (app/(marketing)/page.tsx → /)
    const cleanedSegment = segment.replace(/\/\([^)]+\)/g, "");
    // Strip dynamic param brackets for display
    const displayPath = ("/" + cleanedSegment).replace(/\/+/g, "/") || "/";
    if (seen.has(displayPath)) continue;
    seen.add(displayPath);

    const parts = displayPath.split("/").filter(Boolean);
    const label = parts.length === 0
      ? "Home"
      : parts[parts.length - 1]
          .replace(/[[\]]/g, "")
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

    pages.push({
      id: crypto.randomUUID(),
      path: displayPath,
      label,
      protected: file.content.includes("auth") || file.content.includes("getUser") || displayPath.includes("dashboard"),
    });
  }

  // Sort: root first, then alphabetical
  pages.sort((a, b) => {
    if (a.path === "/") return -1;
    if (b.path === "/") return 1;
    return a.path.localeCompare(b.path);
  });

  return pages;
}

export function RouterWizardPanel({ projectId, files, onInsertCode }: RouterWizardPanelProps) {
  const [pages, setPages] = useState<PageNode[]>([]);
  const [selected, setSelected] = useState<PageNode | null>(null);
  const [newPath, setNewPath] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedRoute, setCopiedRoute] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  useEffect(() => {
    const detected = detectPagesFromFiles(files);
    if (detected.length > 0) {
      setPages(detected);
    } else {
      // Default starter pages for empty project
      setPages([
        { id: crypto.randomUUID(), path: "/", label: "Home", protected: false },
        { id: crypto.randomUUID(), path: "/dashboard", label: "Dashboard", protected: true },
        { id: crypto.randomUUID(), path: "/auth/login", label: "Login", protected: false },
      ]);
    }
  }, [files]);

  function addPage() {
    const rawPath = newPath.trim().startsWith("/") ? newPath.trim() : "/" + newPath.trim();
    if (!rawPath || rawPath === "/" && pages.some((p) => p.path === "/")) return;
    const label = newLabel.trim() || rawPath.split("/").filter(Boolean).pop()?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Page";
    const page: PageNode = {
      id: crypto.randomUUID(),
      path: rawPath,
      label,
      protected: rawPath.includes("dashboard") || rawPath.includes("admin"),
    };
    setPages((p) => [...p, page].sort((a, b) => a.path === "/" ? -1 : b.path === "/" ? 1 : a.path.localeCompare(b.path)));
    setNewPath("");
    setNewLabel("");
    setShowAddForm(false);
    setSelected(page);
  }

  function deletePage(id: string) {
    setPages((p) => p.filter((pg) => pg.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function toggleProtected(id: string) {
    setPages((p) => p.map((pg) => pg.id === id ? { ...pg, protected: !pg.protected } : pg));
    if (selected?.id === id) setSelected((s) => s ? { ...s, protected: !s.protected } : null);
  }

  function startEdit(page: PageNode) {
    setEditingId(page.id);
    setEditLabel(page.label);
  }

  function saveEdit(id: string) {
    setPages((p) => p.map((pg) => pg.id === id ? { ...pg, label: editLabel || pg.label } : pg));
    if (selected?.id === id) setSelected((s) => s ? { ...s, label: editLabel || s.label } : null);
    setEditingId(null);
  }

  function copyRoute(path: string) {
    navigator.clipboard.writeText(path);
    setCopiedRoute(path);
    setTimeout(() => setCopiedRoute(null), 1500);
  }

  async function generatePage(page: PageNode) {
    setGenerating(true);
    const prompt = `Create the Next.js 14 App Router page file at \`app${page.path === "/" ? "" : page.path}/page.tsx\` for a "${page.label}" page.
${page.protected ? "This page requires authentication — check auth via Supabase and redirect to /auth/login if not authenticated." : "This is a public page."}
Use Tailwind CSS and shadcn/ui components. Make it a complete, production-quality page with proper layout, navigation, and relevant content for its purpose.`;
    onInsertCode(prompt);
    setGenerating(false);
  }

  async function generateAllRoutes() {
    const routeList = pages.map((p) => `- \`${p.path}\` (${p.label}${p.protected ? ", protected" : ""})`).join("\n");
    const prompt = `Set up the complete Next.js 14 App Router file structure for this application with these pages:\n\n${routeList}\n\nCreate:\n1. All page.tsx files with proper layouts and placeholder content\n2. A shared layout.tsx for grouped routes\n3. Middleware (middleware.ts) to protect the auth-required routes\n4. Navigation components linking between pages\nUse Tailwind CSS and shadcn/ui throughout.`;
    onInsertCode(prompt);
  }

  // Tree-style grouping
  const topLevel = pages.filter((p) => p.path === "/" || p.path.split("/").filter(Boolean).length === 1);
  const children = (parent: string) => pages.filter((p) => {
    const parts = p.path.split("/").filter(Boolean);
    if (parts.length < 2) return false;
    return "/" + parts.slice(0, -1).join("/") === parent;
  });

  function PageRow({ page, depth = 0 }: { page: PageNode; depth?: number }) {
    const hasChildren = children(page.path).length > 0;
    const isSelected = selected?.id === page.id;
    const isEditing = editingId === page.id;

    return (
      <>
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors group ${isSelected ? "bg-muted text-foreground" : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"}`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => setSelected(isSelected ? null : page)}
        >
          {hasChildren ? <ChevronRight className="w-3 h-3 shrink-0" /> : <span className="w-3 shrink-0" />}
          {page.path === "/" ? <Home className="w-3.5 h-3.5 shrink-0" /> : <FileText className="w-3.5 h-3.5 shrink-0" />}

          {isEditing ? (
            <input
              autoFocus
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={() => saveEdit(page.id)}
              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(page.id); if (e.key === "Escape") setEditingId(null); }}
              className="flex-1 text-xs bg-transparent border-b border-border focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 text-xs font-medium truncate">{page.label}</span>
          )}

          <span className={`text-[10px] font-mono ${getColor(page.path)} shrink-0`}>{page.path}</span>
          {page.protected && <Lock className="w-2.5 h-2.5 shrink-0 text-amber-400" />}

          <div className="hidden group-hover:flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => startEdit(page)} className="p-0.5 hover:text-foreground"><Edit3 className="w-3 h-3" /></button>
            <button onClick={() => copyRoute(page.path)} className="p-0.5 hover:text-foreground">
              {copiedRoute === page.path ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
            <button onClick={() => deletePage(page.id)} className="p-0.5 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
        {children(page.path).map((child) => (
          <PageRow key={child.id} page={child} depth={depth + 1} />
        ))}
      </>
    );
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Map className="w-4 h-4 text-indigo-400" />
          <h2 className="font-semibold text-foreground">Router Wizard</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
            {pages.length} pages
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Manage your Next.js App Router pages visually</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Page tree */}
        <div className="p-3 border-b border-border space-y-0.5">
          {topLevel.map((page) => (
            <PageRow key={page.id} page={page} />
          ))}

          {/* Add page */}
          {showAddForm ? (
            <div className="mt-2 rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <Input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/about or /dashboard/settings"
                className="h-8 text-xs font-mono bg-muted/30 border-border"
              />
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Page label (optional)"
                className="h-8 text-xs bg-muted/30 border-border"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="flex-1 text-xs" onClick={() => setShowAddForm(false)}>Cancel</Button>
                <Button size="sm" className="flex-1 text-xs gap-1" onClick={addPage} disabled={!newPath.trim()}>
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors mt-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add page
            </button>
          )}
        </div>

        {/* Selected page detail */}
        {selected && (
          <div className="p-3 space-y-3 border-b border-border">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-xs font-semibold text-foreground">{selected.label}</p>
                <code className={`text-[11px] font-mono ${getColor(selected.path)}`}>{selected.path}</code>
              </div>
              <Badge
                variant="outline"
                className={`text-[9px] h-5 px-1.5 cursor-pointer ${selected.protected ? "border-amber-500/40 text-amber-400" : "border-border text-muted-foreground"}`}
                onClick={() => toggleProtected(selected.id)}
              >
                {selected.protected ? <><Lock className="w-2.5 h-2.5 inline mr-0.5" />Protected</> : <><Globe className="w-2.5 h-2.5 inline mr-0.5" />Public</>}
              </Badge>
            </div>

            <div className="rounded-md bg-muted/20 border border-border p-2 space-y-1 text-[10px] text-muted-foreground font-mono">
              <div><span className="text-foreground/50">file:</span> app{selected.path === "/" ? "" : selected.path}/page.tsx</div>
              {selected.protected && <div><span className="text-foreground/50">guard:</span> middleware.ts → redirect /auth/login</div>}
            </div>

            <Button
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={() => generatePage(selected)}
              disabled={generating}
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Generate {selected.label} page
            </Button>
          </div>
        )}

        {/* Legend */}
        <div className="p-3 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Legend</p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Lock className="w-3 h-3 text-amber-400" /> <span>Protected (auth required)</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Globe className="w-3 h-3 text-muted-foreground" /> <span>Public route</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Click the badge on a selected page to toggle auth protection. Double-click a label to rename.</p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <Button size="sm" className="w-full gap-1.5" onClick={generateAllRoutes}>
          <ArrowRight className="w-3.5 h-3.5" /> Generate all routes with AI
        </Button>
      </div>
    </div>
  );
}
