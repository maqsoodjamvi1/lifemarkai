
import { useEffect,useState } from "react";
import { AnimatePresence,motion } from "framer-motion";
import { Check,ChevronRight,Loader2,Sparkles,X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentTaskStep } from "./agent-step-utils";
import { LovableAgentStepGlyph } from "./agent-step-glyph";

interface LiveTasksDetail {
  streaming?: boolean;
  steps?: AgentTaskStep[];
}

/** Lovable-parity floating Tasks sidebar while the agent is running. */
export function LovableLiveTasksDock() {
  const [open, setOpen] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [steps, setSteps] = useState<AgentTaskStep[]>([]);

  useEffect(() => {
    function onTasks(e: Event) {
      const detail = (e as CustomEvent<LiveTasksDetail>).detail ?? {};
      setStreaming(!!detail.streaming);
      setSteps(detail.steps ?? []);
    }
    window.addEventListener("lifemark-live-tasks", onTasks);
    return () => window.removeEventListener("lifemark-live-tasks", onTasks);
  }, []);

  const visible = steps.length > 0;
  const done = steps.filter((s) => s.status === "done").length;
  const allDone = done === steps.length && steps.length > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: 0.18 }}
          className="fixed right-3 top-20 z-50 w-[min(280px,calc(100vw-1.5rem))] pointer-events-auto"
        >
          <div className="rounded-xl border border-[color:var(--border-default)] bg-[var(--bg-translucent)] backdrop-blur-md shadow-surface-md overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 border-b border-[color:var(--border-default)] bg-gradient-to-r from-violet-500/10 to-transparent text-left"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--fg-accent)] shrink-0" />
              <span className="text-xs font-medium text-[var(--fg-primary)]">
                {allDone && !streaming ? "Tasks complete" : "Live tasks"}
              </span>
              <span className="ml-auto text-[10px] text-[var(--fg-tertiary)] tabular-nums">
                {done}/{steps.length}
              </span>
              {open ? (
                <X className="w-3 h-3 text-[var(--fg-tertiary)] shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-[var(--fg-tertiary)] shrink-0" />
              )}
            </button>
            {open && (
              <div className="max-h-72 overflow-y-auto px-2 py-1.5 space-y-0.5">
                {steps.map((step, i) => (
                  <button
                    key={step.key + i}
                    type="button"
                    onClick={() => {
                      const path =
                        step.path ||
                        step.label.match(/(?:Editing|Reading|Checking|Removing)\s+(\S+)/)?.[1];
                      if (!path) return;
                      window.dispatchEvent(
                        new CustomEvent("lifemark-open-file-at-line", {
                          detail: { path, line: 1 },
                        }),
                      );
                    }}
                    className="w-full flex items-center gap-2 px-1.5 py-1 rounded-lg text-xs text-left hover:bg-[var(--glow-neutral-hover)] transition-colors"
                  >
                    <span className="shrink-0">
                      {step.status === "done" ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--fg-accent)]" />
                      )}
                    </span>
                    <LovableAgentStepGlyph kind={step.kind} />
                    <span
                      className={cn(
                        "truncate",
                        step.status === "done"
                          ? "text-[var(--fg-tertiary)]"
                          : "text-[var(--fg-primary)] font-medium",
                      )}
                    >
                      {step.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
