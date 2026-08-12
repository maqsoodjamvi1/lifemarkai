
import { useState } from "react";
import { ChevronDown,ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentTraceStep {
  t: string;
  tool?: string;
  c: string;
  path?: string;
}

interface LovableAgentTraceProps {
  trace: AgentTraceStep[];
  seconds?: number;
  totalSteps?: number;
  className?: string;
}

/** Lovable-parity collapsible "Worked for Xs · N steps" disclosure. */
export function LovableAgentTrace({ trace, seconds, totalSteps, className }: LovableAgentTraceProps) {
  const [open, setOpen] = useState(false);
  if (trace.length === 0) return null;
  const count = totalSteps ?? trace.length;

  function openPath(path: string) {
    window.dispatchEvent(
      new CustomEvent("lifemark-open-file-at-line", { detail: { path, line: 1 } }),
    );
  }

  return (
    <div className={cn("mt-1.5", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] transition-colors"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Worked
        {seconds ? ` for ${seconds >= 90 ? `${Math.round(seconds / 60)}m` : `${seconds}s`}` : ""}
        {" · "}
        {count} step{count === 1 ? "" : "s"}
      </button>
      {open && (
        <div className="mt-1.5 border-l-2 border-[color:var(--border-default)] pl-2.5 space-y-1 max-h-52 overflow-y-auto">
          {trace.map((s, i) => (
            <div key={i} className="text-[11px] leading-snug flex items-start gap-1.5">
              <span className={cn("shrink-0 mt-0.5", s.t === "thought" ? "text-violet-400/70" : "text-cyan-400/70")}>
                {s.t === "thought" ? "◦" : "▸"}
              </span>
              <span className="text-[var(--fg-secondary)] break-words min-w-0">
                {s.tool && <span className="font-mono text-[var(--fg-primary)]">{s.tool}</span>}
                {s.path && (
                  <button
                    type="button"
                    onClick={() => openPath(s.path!)}
                    className="font-mono text-[var(--fg-tertiary)] hover:text-violet-400 hover:underline transition-colors"
                    title={`Open ${s.path}`}
                  >
                    {" "}
                    {s.path}
                  </button>
                )}
                {s.tool || s.path ? " — " : ""}
                {s.c}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
