import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, Link2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardHeroProps {
  firstName: string;
}

type Framework = "tanstack-start" | "react" | "next" | "vue" | "svelte";

const SUGGESTIONS = [
  "SaaS dashboard with analytics and user management",
  "E-commerce store with cart and Stripe checkout",
  "Real-time chat app with rooms and online presence",
  "Kanban board with drag-and-drop columns",
];

function HeroPromptCreateBox() {
  const [prompt, setPrompt] = useState("");
  // Vite + React + TypeScript is the default: it is the stack Lovable itself
  // generates, it publishes (an SSR build has no index.html to serve), and it
  // has no whole-document hydration for a browser extension to break.
  const [framework, setFramework] = useState<Framework>("react");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;

  useEffect(() => {
    const isNew =
      search.new === "true" ||
      search.new === "1" ||
      search.fromUrl === "true" ||
      search.fromUrl === "1";
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
      if (res.status === 401) {
        throw new Error("Please sign in to create a project");
      }
      const project = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok || !project.id) {
        throw new Error(project.error || "Create failed");
      }
      await navigate({
        to: "/editor/$projectId",
        params: { projectId: project.id },
        search: { prompt: trimmed, mode: "build" },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border shadow-sm bg-white/90 border-white/80 backdrop-blur-sm">
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
        rows={4}
        className="w-full resize-none bg-transparent px-4 pt-4 text-sm outline-none placeholder:text-muted-foreground/70 text-slate-900"
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
          {error && (
            <span className="text-xs text-destructive max-w-[200px] truncate">{error}</span>
          )}
          <Button
            size="sm"
            disabled={!prompt.trim() || loading}
            onClick={() => void handleCreate()}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Build
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
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
    </div>
  );
}

export function DashboardHero({ firstName }: DashboardHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/40 mb-8">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "linear-gradient(135deg, #dbeafe 0%, #e9d5ff 35%, #fbcfe8 60%, #fef3c7 85%, #ffffff 100%)",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.5),transparent_60%)]" />

      <div className="relative px-6 py-10 md:py-14 flex flex-col items-center text-center max-w-3xl mx-auto">
        <Link
          to="/connectors"
          className="inline-flex items-center gap-1.5 mb-4 px-3 py-1 rounded-full bg-white/70 border border-white/80 text-[11px] font-medium text-violet-800 shadow-sm hover:bg-white transition-colors"
        >
          <Link2 className="w-3 h-3" />
          Power your app with connectors
        </Link>

        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mb-6 tracking-tight">
          Got an idea, {firstName}?
        </h1>

        <div className="w-full">
          <HeroPromptCreateBox />
        </div>
      </div>
    </section>
  );
}
