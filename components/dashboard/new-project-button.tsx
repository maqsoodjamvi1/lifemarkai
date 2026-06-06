"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Loader2, Sparkles, Zap, Code2, Box, Wind,
  ArrowRight, Wand2, Github,
} from "lucide-react";
import { GitHubImportModal } from "./github-import-modal";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const FRAMEWORKS = [
  { id: "react", label: "React", sub: "Vite", icon: Code2, color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/5" },
  { id: "next", label: "Next.js", sub: "App Router", icon: Zap, color: "text-slate-300 border-slate-500/30 bg-slate-500/5" },
  { id: "vue", label: "Vue 3", sub: "Vite", icon: Box, color: "text-green-400 border-green-500/30 bg-green-500/5" },
  { id: "svelte", label: "SvelteKit", sub: "Kit", icon: Wind, color: "text-orange-400 border-orange-500/30 bg-orange-500/5" },
] as const;

const QUICK_PROMPTS = [
  "SaaS dashboard with analytics and user management",
  "E-commerce store with cart and Stripe checkout",
  "Kanban board with drag-and-drop",
];

export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [framework, setFramework] = useState<"react" | "next" | "vue" | "svelte">("react");
  const router = useRouter();
  const { toast } = useToast();

  function handleClose() {
    if (loading) return;
    setOpen(false);
    setName("");
    setPrompt("");
    setFramework("react");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const projectName = name.trim() || (prompt.trim().slice(0, 45) + (prompt.length > 45 ? "…" : ""));
    if (!projectName) return;

    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          description: prompt.trim() || undefined,
          framework,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const project = await res.json();
      handleClose();
      const editorUrl = prompt.trim()
        ? `/editor/${project.id}?prompt=${encodeURIComponent(prompt.trim())}`
        : `/editor/${project.id}`;
      router.push(editorUrl);
    } catch (err: unknown) {
      toast({
        title: "Failed to create project",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="gap-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white shadow-lg shadow-violet-500/20"
      >
        <Plus className="w-4 h-4" />
        New Project
      </Button>
      {/* Import button lives on NewProjectButton so it can be rendered alongside it */}

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                <Wand2 className="w-4 h-4 text-white" />
              </div>
              Create New Project
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-5 mt-1">
            {/* Starter prompt */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Describe your app{" "}
                <span className="text-muted-foreground font-normal text-xs">(AI builds it immediately)</span>
              </Label>
              <Textarea
                placeholder="Build a SaaS dashboard with a sidebar, analytics cards, a data table with filters, and dark mode…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[88px] resize-none text-sm"
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrompt(p)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted hover:bg-accent hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Project name */}
            <div className="space-y-2">
              <Label htmlFor="proj-name" className="text-sm font-medium">
                Project name{" "}
                <span className="text-muted-foreground font-normal text-xs">(auto-filled if blank)</span>
              </Label>
              <Input
                id="proj-name"
                placeholder={prompt ? prompt.slice(0, 42) + "…" : "My Awesome App"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Framework picker */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Framework</Label>
              <div className="grid grid-cols-4 gap-2">
                {FRAMEWORKS.map(({ id, label, sub, icon: Icon, color }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFramework(id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      framework === id
                        ? `border-primary ${color}`
                        : "border-border bg-card hover:border-border/60"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${framework === id ? color.split(" ")[0] : "text-muted-foreground"}`} />
                    <span className="text-xs font-semibold">{label}</span>
                    <span className="text-[10px] text-muted-foreground leading-none">{sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white gap-2"
                disabled={loading || (!name.trim() && !prompt.trim())}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                ) : prompt.trim() ? (
                  <><Sparkles className="w-4 h-4" /> Build with AI</>
                ) : (
                  <>Create Project <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Combined project action buttons: New Project + Import from GitHub.
 * Drop-in replacement for <NewProjectButton /> where both actions are wanted.
 */
export function ProjectActions() {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setImportOpen(true)}
        className="gap-2 text-sm"
      >
        <Github className="w-4 h-4" />
        Import
      </Button>
      <NewProjectButton />
      <GitHubImportModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
