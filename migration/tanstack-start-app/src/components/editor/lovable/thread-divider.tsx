
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { useState } from "react";

interface LovableThreadDividerProps {
  turnNumber: number;
  preview: string;
  collapsed: boolean;
  onToggle: () => void;
  searchMatchCount?: number;
  onCopyThread?: () => void | Promise<void>;
}

/** Lovable-parity collapsible turn divider between conversation threads. */
export function LovableThreadDivider({
  turnNumber,
  preview,
  collapsed,
  onToggle,
  searchMatchCount = 0,
  onCopyThread,
}: LovableThreadDividerProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 h-px bg-border/40" />
      <div className="flex items-center gap-1 shrink-0 max-w-[300px]">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-border/50 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors max-w-[240px]"
        >
          <span className="font-medium text-violet-400/80 shrink-0">Turn {turnNumber}</span>
          {searchMatchCount > 0 && (
            <span className="text-[9px] text-violet-400/90 shrink-0 tabular-nums">
              {searchMatchCount} hit{searchMatchCount === 1 ? "" : "s"}
            </span>
          )}
          {collapsed && preview && <span className="truncate opacity-70 text-[10px]">{preview}</span>}
          {collapsed ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronUp className="w-3 h-3 shrink-0" />}
        </button>
        {onCopyThread && (
          <button
            type="button"
            onClick={async () => {
              await onCopyThread();
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }}
            className="p-1 rounded-full border border-border/40 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Copy this turn"
          >
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          </button>
        )}
      </div>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}
