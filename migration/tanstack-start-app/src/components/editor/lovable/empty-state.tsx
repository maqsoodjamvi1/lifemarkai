
import { Palette,Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovableChatEmptyStateProps {
  prompts: string[];
  onSelectPrompt: (prompt: string) => void;
  onExploreDesignDirections?: () => void;
  className?: string;
}

/** Lovable-parity empty chat — sparkle hero + bordered suggestion cards. */
export function LovableChatEmptyState({
  prompts,
  onSelectPrompt,
  onExploreDesignDirections,
  className,
}: LovableChatEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center h-full py-10 px-4", className)}>
      <div className="w-14 h-14 rounded-[var(--radius-4)] bg-gradient-to-br from-violet-600/20 to-purple-600/10 border border-violet-500/20 flex items-center justify-center mb-5 shadow-surface-md">
        <Sparkles className="w-7 h-7 text-[var(--fg-accent)]" />
      </div>
      <h3 className="text-base font-[500] mb-1.5 text-[var(--fg-primary)]">Start building with AI</h3>
      <p className="text-xs text-[var(--fg-tertiary)] mb-7 text-center max-w-[240px] leading-relaxed">
        Describe what you want to build, fix, or improve and watch it come to life.
      </p>
      <div className="w-full max-w-sm space-y-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelectPrompt(prompt)}
            className="w-full text-left text-xs px-3.5 py-2.5 rounded-[var(--radius-3)] border border-[color:var(--border-default)] bg-[var(--bg-secondary-pulse)] hover:bg-[var(--bg-muted)] hover:border-[color:var(--border-accent)] transition-all text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] group shadow-surface-xs"
          >
            <span className="flex items-start gap-2">
              <span className="mt-0.5 text-[var(--fg-accent)]/60 group-hover:text-[var(--fg-accent)] transition-colors">→</span>
              <span>{prompt}</span>
            </span>
          </button>
        ))}
      </div>
      {onExploreDesignDirections && (
        <button
          type="button"
          onClick={onExploreDesignDirections}
          className="mt-5 flex items-center gap-2 text-xs px-3.5 py-2 rounded-[var(--radius-3)] border border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/15 hover:text-violet-200 transition-colors"
        >
          <Palette className="w-3.5 h-3.5" />
          Explore 3 design directions first
        </button>
      )}
    </div>
  );
}
