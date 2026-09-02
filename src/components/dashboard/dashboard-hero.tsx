import { useEffect,useRef,useState } from "react";
import { Link,useNavigate,useSearch } from "@tanstack/react-router";
import { ArrowRight,Link2,Loader2,MessageCircle,Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recommendedFrameworkForPrompt } from "@/lib/project/generation-profile";
import { cn } from "@/lib/utils";

interface DashboardHeroProps {
  firstName: string;
}


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
  // No framework picker: the platform decides — instant static runtime for
  // simple sites, TanStack Start for everything else (one contract, bug-free).
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lovable parity: a dedicated Chat Mode entry point for starting a new
  // project via conversation before any code is generated. The editor
  // already fully supports mode="chat" as one of its five tabs (plan/build/
  // agent/chat/patch — see editor-search.ts) — the only thing missing was a
  // way to land there from project creation, since this hero always hardcoded
  // mode: "build" and offered a single "Build" button. Defaults to "build" so
  // existing behavior is unchanged unless someone opts into "Chat first".
  const [startMode, setStartMode] = useState<"build" | "chat">("build");
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
          framework: recommendedFrameworkForPrompt(trimmed),
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
      // Outside the try above on purpose: the project already exists
      // server-side at this point, so a navigation failure is a different
      // problem than a creation failure — telling the user "Failed to
      // create project" here would be wrong, since it was created; they'd
      // just have an orphaned project with no obvious way to reach it.
      try {
        await navigate({
          to: "/editor/$projectId",
          params: { projectId: project.id },
          search: { prompt: trimmed, mode: startMode },
        });
      } catch {
        setError("Your project was created, but we couldn't open it automatically. Find it on your dashboard.");
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-background/70 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
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
        className="w-full resize-none bg-transparent px-4 pt-4 text-sm outline-none placeholder:text-muted-foreground text-foreground"
      />
      <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
        <span className="text-[11px] text-muted-foreground">
          LifemarkAI picks the right stack for your app automatically
        </span>
        <div className="ml-auto flex items-center gap-2">
          {error && (
            <span className="text-xs text-destructive max-w-[200px] truncate">{error}</span>
          )}

          {/* Build immediately, or start with a conversation first (Lovable's
              Chat Mode) — the same choice offered inside the editor itself,
              just moved up to before the project even exists. */}
          <div
            role="radiogroup"
            aria-label="Start mode"
            className="flex items-center gap-0.5 p-0.5 rounded-full bg-white/5"
          >
            <button
              type="button"
              role="radio"
              aria-checked={startMode === "build"}
              onClick={() => setStartMode("build")}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                startMode === "build" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Build
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={startMode === "chat"}
              onClick={() => setStartMode("chat")}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                startMode === "chat" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              title="Talk it through first — nothing gets built until you're ready"
            >
              Chat first
            </button>
          </div>

          <Button
            size="sm"
            disabled={!prompt.trim() || loading}
            onClick={() => void handleCreate()}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : startMode === "chat" ? (
              <MessageCircle className="w-3.5 h-3.5" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {startMode === "chat" ? "Start chatting" : "Build"}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-3 pb-3 border-t border-white/10 pt-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setPrompt(s)}
            className="text-[11px] px-2 py-1 rounded-full bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
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
    <section className="relative overflow-hidden rounded-2xl border border-border mb-8">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 20% -10%, rgba(59,130,246,0.28), transparent 50%), radial-gradient(ellipse 70% 60% at 90% 120%, rgba(124,58,237,0.22), transparent 46%), hsl(var(--background))",
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,hsl(var(--background)/0.35))]" />

      <div className="relative px-6 py-10 md:py-14 flex flex-col items-center text-center max-w-3xl mx-auto">
        <Link
          to="/connectors"
          className="inline-flex items-center gap-1.5 mb-4 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-foreground/80 hover:bg-white/10 transition-colors"
        >
          <Link2 className="w-3 h-3" />
          Power your app with connectors
        </Link>

        <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-6 tracking-tight">
          Got an idea, {firstName}?
        </h1>

        <div className="w-full">
          <HeroPromptCreateBox />
        </div>
      </div>
    </section>
  );
}
