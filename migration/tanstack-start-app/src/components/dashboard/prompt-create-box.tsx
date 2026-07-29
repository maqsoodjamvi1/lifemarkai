/**
 * Shell PromptCreateBox — creates a project via proxied POST /api/projects
 * and opens the editor with the starter prompt.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

// Keep this list and the default in sync with dashboard-hero.tsx and with the
// server default in lib/server-fns/projects.ts ("tanstack-start"). This box
// ALWAYS sends an explicit `framework`, so the server default never applies to
// this path — omitting tanstack-start here silently made "react" the real
// default for the primary create flow.
type Framework = "tanstack-start" | "react" | "next" | "vue" | "svelte";

interface PromptCreateBoxProps {
  variant?: "default" | "hero";
}

const SUGGESTIONS = [
  "SaaS dashboard with analytics and user management",
  "E-commerce store with cart and Stripe checkout",
  "Real-time chat app with rooms and online presence",
  "Kanban board with drag-and-drop columns",
];

export function PromptCreateBox({ variant = "default" }: PromptCreateBoxProps) {
  const [prompt, setPrompt] = useState("");
  const [framework, setFramework] = useState<Framework>("tanstack-start");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const isHero = variant === "hero";
  // Dashboard search may include new/fromUrl/prompt (loose — not all routes define it).
  const search = useSearch({ strict: false }) as Record<string, unknown>;

  useEffect(() => {
    const isNew =
      search.new === "true" || search.new === "1" || search.fromUrl === "true" || search.fromUrl === "1";
    if (typeof search.prompt === "string" && search.prompt) {
      setPrompt(search.prompt);
    }
    if (isNew) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [search.new, search.fromUrl, search.prompt]);

  async function handleCreate() {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const name = trimmed.slice(0, 50) + (trimmed.length > 50 ? "…" : "");
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: trimmed.slice(0, 10_000),
          framework,
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Create failed");
      const project = await res.json();
      const id = project.id as string;
      await navigate({
        to: "/editor/$projectId",
        params: { projectId: id },
        search: { prompt: trimmed, mode: "build" },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setLoading(false);
    }
  }

  return (
    <div
      className={`rounded-2xl border shadow-sm ${
        isHero
          ? "bg-white/90 border-white/80 backdrop-blur-sm"
          : "bg-card border-border"
      }`}
    >
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void handleCreate();
          }
        }}
        placeholder="Describe the app you want to build…"
        rows={isHero ? 4 : 3}
        className={`w-full resize-none bg-transparent px-4 pt-4 text-sm outline-none placeholder:text-muted-foreground/70 ${
          isHero ? "text-slate-900" : "text-foreground"
        }`}
      />

      <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
        <div className="flex gap-1">
          {(["tanstack-start", "react", "next", "vue", "svelte"] as const).map((fw) => (
            <button
              key={fw}
              type="button"
              onClick={() => setFramework(fw)}
              className={`px-2 py-1 text-[11px] rounded-md border capitalize ${
                framework === fw
                  ? "border-violet-500/50 bg-violet-500/10 text-violet-700"
                  : "border-transparent text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {fw === "next" ? "Next.js" : fw === "tanstack-start" ? "Start" : fw}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-xs text-destructive max-w-[200px] truncate">{error}</span>}
          <Button
            size="sm"
            disabled={!prompt.trim() || loading}
            onClick={() => void handleCreate()}
            className="gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Build
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {isHero && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3 border-t border-black/5 pt-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPrompt(s)}
              className="text-[11px] px-2 py-1 rounded-full bg-black/5 text-slate-600 hover:bg-black/10 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
