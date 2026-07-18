"use client";

import { cn } from "@/lib/utils";
import type { EditorMode } from "@/components/editor/editor-layout";

interface LovableComposerModeRowProps {
  mode: EditorMode;
  clarifyFirst: boolean;
  showClarifyToggle: boolean;
  onModeChange: (mode: EditorMode) => void;
  onToggleClarify: () => void;
  className?: string;
}

/** Lovable-parity primary mode pills: Plan | Build (Chat/Agent in overflow menu). */
export function LovableComposerModeRow({
  mode,
  clarifyFirst,
  showClarifyToggle,
  onModeChange,
  onToggleClarify,
  className,
}: LovableComposerModeRowProps) {
  const buildActive = mode === "build" || mode === "agent" || mode === "patch";

  return (
    <div className={cn("flex items-center gap-1.5 flex-shrink-0", className)}>
      <div className="flex items-center rounded-lg border border-[color:var(--border-default)] overflow-hidden">
        <button
          type="button"
          onClick={() => onModeChange("plan")}
          className={cn(
            "h-7 px-2.5 text-xs font-[500] transition-colors",
            mode === "plan"
              ? "bg-[var(--bg-muted)] text-[var(--fg-primary)]"
              : "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)]/40",
          )}
        >
          Plan
        </button>
        <button
          type="button"
          onClick={() => onModeChange("build")}
          className={cn(
            "h-7 px-2.5 text-xs font-[500] transition-colors border-l border-[color:var(--border-default)]",
            buildActive
              ? "bg-[var(--bg-muted)] text-[var(--fg-primary)]"
              : "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)]/40",
          )}
        >
          Build
        </button>
      </div>

      {showClarifyToggle && (
        <button
          type="button"
          onClick={onToggleClarify}
          className={cn(
            "h-7 px-2.5 rounded-lg border text-xs font-medium transition-colors",
            clarifyFirst
              ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
              : "border-[color:var(--border-default)] text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)]/40",
          )}
          title="Ask clarifying questions before the first build"
        >
          Clarify
        </button>
      )}
    </div>
  );
}
