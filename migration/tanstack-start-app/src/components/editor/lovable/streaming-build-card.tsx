
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StreamingBuildStep {
  label: string;
  status: "running" | "done";
  kind: string;
  key: string;
}

interface LovableStreamingBuildCardProps {
  steps: StreamingBuildStep[];
  title?: string;
  renderStepIcon?: (kind: string) => React.ReactNode;
  className?: string;
}

/** Lovable-parity live Tasks panel during agent/build streams. */
export function LovableStreamingBuildCard({
  steps,
  title = "Building your app",
  renderStepIcon,
  className,
}: LovableStreamingBuildCardProps) {
  if (steps.length === 0) return null;
  const done = steps.filter((s) => s.status === "done").length;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className={cn("overflow-hidden", className)}
      >
        <div className="rounded-[var(--radius-3)] border border-[color:var(--border-default)] bg-[var(--bg-secondary-pulse)] overflow-hidden mb-1 shadow-surface-xs">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--border-default)] bg-gradient-to-r from-violet-500/10 to-transparent">
            <Sparkles className="w-3.5 h-3.5 text-[var(--fg-accent)] shrink-0" />
            <span className="text-xs font-[500] text-[var(--fg-primary)]">{title}</span>
            <span className="ml-auto text-[10px] text-[var(--fg-tertiary)] tabular-nums">
              {done}/{steps.length}
            </span>
          </div>
          <div className="px-2 py-1.5 space-y-0.5 max-h-64 overflow-y-auto">
            {steps.map((step, i) => (
              <div key={step.key + i} className="flex items-center gap-2 px-1.5 py-1 rounded-lg text-xs">
                <span className="shrink-0">
                  {step.status === "done"
                    ? <Check className="w-3.5 h-3.5 text-green-400" />
                    : <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--fg-accent)]" />}
                </span>
                {renderStepIcon?.(step.kind)}
                <span className={cn(
                  "truncate",
                  step.status === "done" ? "text-[var(--fg-tertiary)]" : "text-[var(--fg-primary)] font-medium",
                )}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
