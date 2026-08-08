
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorMode } from "@/components/editor/editor-layout";
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LovableComposerModeRowProps {
  mode: EditorMode;
  clarifyFirst: boolean;
  showClarifyToggle: boolean;
  onModeChange: (mode: EditorMode) => void;
  onToggleClarify: () => void;
  className?: string;
}

const MODE_LABEL: Record<string, string> = {
  plan: "Plan",
  build: "Build",
  agent: "Agent",
  chat: "Chat",
  patch: "Build",
};

/**
 * Lovable dump: single **Build** mode pill with aria-expanded dropdown
 * (Plan / Build / Agent / Chat) + optional Clarify.
 */
export function LovableComposerModeRow({
  mode,
  clarifyFirst,
  showClarifyToggle,
  onModeChange,
  onToggleClarify,
  className,
}: LovableComposerModeRowProps) {
  const label = MODE_LABEL[mode] ?? "Build";

  return (
    <div className={cn("flex items-center gap-1.5 flex-shrink-0", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-haspopup="menu"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border border-[color:var(--border-default)]",
              "bg-[var(--bg-muted)]/50 px-2.5 text-xs font-[500] text-[var(--fg-primary)]",
              "hover:bg-[var(--bg-muted)] transition-colors",
            )}
          >
            {label}
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-36 p-1">
          {(
            [
              ["plan", "Plan"],
              ["build", "Build"],
              ["agent", "Agent"],
              ["chat", "Chat"],
            ] as const
          ).map(([id, text]) => (
            <DropdownMenuItem
              key={id}
              className="text-xs"
              onClick={() => onModeChange(id)}
            >
              <span
                className={cn(
                  "flex-1",
                  (mode === id || (id === "build" && mode === "patch")) && "font-semibold",
                )}
              >
                {text}
              </span>
              {(mode === id || (id === "build" && mode === "patch")) && (
                <span className="text-[10px] text-[var(--fg-accent)]">✓</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {showClarifyToggle && (
        <button
          type="button"
          onClick={onToggleClarify}
          className={cn(
            "h-7 px-2.5 rounded-full border text-xs font-medium transition-colors",
            clarifyFirst
              ? "border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300"
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
