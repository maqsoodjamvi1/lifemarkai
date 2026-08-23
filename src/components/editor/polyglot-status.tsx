import { Loader2 } from "lucide-react";

export type PolyglotHealthState = {
  rust: boolean;
  python: boolean;
  mode: "polyglot" | "llm-only";
  rustLive?: boolean;
  rustReady?: boolean;
  rustSymbols?: number;
  rustEdges?: number;
};

/** Compact status strip for Rust AST + Python AI (liveness + readiness). */
export function PolyglotStatus({
  health,
  loading,
}: {
  health: PolyglotHealthState | null;
  loading?: boolean;
}) {
  if (loading && !health) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        checking engines…
      </div>
    );
  }
  const rust = health?.rust ?? false;
  const python = health?.python ?? false;
  const mode = health?.mode ?? "llm-only";
  const symbols = health?.rustSymbols ?? 0;
  const ready = health?.rustReady ?? false;
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/10 px-2 py-1 text-[10px]"
      title="Rust = structural impact; Python = agent plan. Unset env = LLM-only."
    >
      <span className="font-medium text-muted-foreground">engines</span>
      <span className={rust ? "text-emerald-600" : "text-muted-foreground"}>
        rust {rust ? (ready ? "ready" : "live") : "off"}
      </span>
      {rust && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{symbols} sym</span>
        </>
      )}
      <span className="text-muted-foreground">·</span>
      <span className={python ? "text-emerald-600" : "text-muted-foreground"}>
        python {python ? "ok" : "off"}
      </span>
      <span className="text-muted-foreground">·</span>
      <span className={mode === "polyglot" ? "text-sky-600" : "text-muted-foreground"}>
        {mode}
      </span>
    </div>
  );
}

/** Fetch /api/editor-intelligence/polyglot-health once on mount. */
export async function fetchPolyglotHealth(): Promise<PolyglotHealthState> {
  try {
    const res = await fetch("/api/editor-intelligence/polyglot-health");
    if (!res.ok) return { rust: false, python: false, mode: "llm-only" };
    const data = (await res.json()) as Partial<PolyglotHealthState> & { mode?: string };
    return {
      rust: !!data.rust,
      python: !!data.python,
      mode: data.mode === "polyglot" ? "polyglot" : "llm-only",
      rustLive: data.rustLive,
      rustReady: data.rustReady,
      rustSymbols: data.rustSymbols,
      rustEdges: data.rustEdges,
    };
  } catch {
    return { rust: false, python: false, mode: "llm-only" };
  }
}
