"use client";

import { useState, useEffect } from "react";
import { Brain, Save, Loader2, Sparkles, RotateCcw, Info, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface WorkspaceKnowledgePageProps {
  user: User;
}

const EXAMPLES = [
  "Always use TypeScript strict mode and define explicit return types.",
  "Use Tailwind CSS for all styling. Never use inline styles.",
  "Follow the repository pattern for data access — never query DB directly in components.",
  "Write JSDoc comments for all exported functions.",
  "Use React Query (TanStack Query) for all server state management.",
  "Prefer named exports over default exports.",
  "Always handle loading and error states in UI components.",
  "Use Zod for runtime validation of all API inputs.",
];

const PLACEHOLDER = `Enter rules and conventions that will apply to every project in your workspace.

Examples:
• Always use TypeScript strict mode
• Use Tailwind CSS for all styling
• Follow the component pattern: separate logic into hooks, keep JSX lean
• Use Zod for all input validation
• Prefer named exports
• Write tests for all utility functions

The AI will follow these instructions across all your projects.`;

export function WorkspaceKnowledgePage({ user }: WorkspaceKnowledgePageProps) {
  const { toast } = useToast();
  const supabase = createClient();

  const [knowledge, setKnowledge] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    const proceed = !knowledge.trim()
      || window.confirm("Replace the current draft with an AI-generated draft built from your recent projects?");
    if (!proceed) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/account/generate-workspace-knowledge", { method: "POST" });
      const data = await res.json() as { knowledge?: string; error?: string };
      if (!res.ok || !data.knowledge) {
        toast({ title: "Generation failed", description: data.error ?? "Try again.", variant: "destructive" });
        return;
      }
      setKnowledge(data.knowledge);
      toast({ title: "Draft ready", description: "Review and edit, then Save to apply." });
    } catch (err) {
      toast({ title: "Generation failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    async function load() {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("workspace_knowledge")
        .eq("id", user.id)
        .single();
      const val = data?.workspace_knowledge ?? "";
      setKnowledge(val);
      setSaved(val);
      setLoading(false);
    }
    void load();
  }, [user.id]);

  async function handleSave() {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ workspace_knowledge: knowledge.trim() || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setSaved(knowledge.trim());
      toast({ title: "Workspace knowledge saved", description: "All future AI calls will include these rules." });
    }
  }

  function handleAddExample(example: string) {
    setKnowledge((prev) => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}\n• ${example}` : `• ${example}`;
    });
  }

  const isDirty = knowledge.trim() !== saved.trim();
  const charCount = knowledge.length;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <Brain className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Workspace Knowledge</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define coding standards, conventions, and rules that the AI will follow across
            <strong className="text-foreground"> every project</strong> in your workspace — automatically, without needing to repeat them per-project.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-300 leading-relaxed">
          <strong>How it works:</strong> This content is injected into the system prompt of every AI chat call across all your projects.
          Use it to set global coding standards. Per-project instructions (in the Knowledge panel inside each editor) are also included and take precedence if they conflict.
        </div>
      </div>

      {/* Generate from recent projects — Lovable best-practice #1 */}
      <Button
        onClick={handleGenerate}
        disabled={generating || loading}
        variant="outline"
        className="w-full border-violet-500/30 bg-violet-500/[0.06] text-violet-300 hover:bg-violet-500/10 hover:text-violet-200 gap-2"
      >
        {generating ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Drafting from your recent projects…</>
        ) : (
          <><Wand2 className="w-4 h-4" /> Generate from my recent projects</>
        )}
      </Button>

      {/* Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Your workspace rules</label>
          <span className={`text-xs tabular-nums ${charCount > 4000 ? "text-red-400" : "text-muted-foreground/50"}`}>
            {charCount} / 5000
          </span>
        </div>
        {loading ? (
          <div className="h-64 rounded-lg border border-border bg-muted/20 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Textarea
            value={knowledge}
            onChange={(e) => setKnowledge(e.target.value)}
            placeholder={PLACEHOLDER}
            maxLength={5000}
            className="min-h-64 font-mono text-sm resize-y leading-relaxed"
          />
        )}
      </div>

      {/* Quick-add examples */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Quick-add common rules</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => handleAddExample(ex)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-violet-500/40 hover:text-foreground hover:bg-violet-500/5 transition-colors"
            >
              + {ex.length > 50 ? ex.slice(0, 50) + "…" : ex}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button
          onClick={handleSave}
          disabled={saving || !isDirty || charCount > 5000}
          className="gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving…" : "Save rules"}
        </Button>
        {isDirty && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setKnowledge(saved)}
            className="gap-1.5 text-muted-foreground"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Discard changes
          </Button>
        )}
        {!isDirty && saved && (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Saved and active
          </span>
        )}
      </div>

      {/* Clear */}
      {saved && (
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-3">
            Remove workspace knowledge to stop injecting global rules into AI prompts.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setKnowledge("");
              setSaving(true);
              await (supabase as any).from("profiles").update({ workspace_knowledge: null }).eq("id", user.id);
              setSaving(false);
              setSaved("");
              toast({ title: "Workspace knowledge cleared" });
            }}
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            Clear workspace knowledge
          </Button>
        </div>
      )}
    </div>
  );
}
