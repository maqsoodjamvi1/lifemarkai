
import { Zap } from "lucide-react";

export interface CloudActionRequest {
  kind: "pause" | "resume" | "resize";
  currentTier: string;
  paused: boolean;
  actionable: boolean;
}

const TIERS = ["tiny", "mini", "small", "medium", "large"] as const;

interface LovableCloudOpsCardProps {
  action: CloudActionRequest;
  tierPick: string;
  busy: boolean;
  onTierPick: (tier: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Lovable-parity cloud backend pause/wake/resize approval above composer. */
export function LovableCloudOpsCard({
  action,
  tierPick,
  busy,
  onTierPick,
  onConfirm,
  onCancel,
}: LovableCloudOpsCardProps) {
  const title =
    action.kind === "resize"
      ? "Resize Cloud instance"
      : action.kind === "pause"
        ? "Pause Cloud backend"
        : "Wake Cloud backend";

  const confirmLabel =
    busy
      ? "Working…"
      : action.kind === "resize"
        ? `Resize to ${tierPick}`
        : action.kind === "pause"
          ? "Pause backend"
          : "Wake up";

  return (
    <div className="mb-2 rounded-[var(--radius-3)] border border-violet-500/30 bg-violet-500/5 px-3 py-2">
      <div className="flex items-center gap-2">
        <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
        <span className="text-xs font-medium text-[var(--fg-primary)]/90">{title}</span>
        <span className="text-[10px] text-[var(--fg-tertiary)] ml-auto">current: {action.currentTier}</span>
      </div>
      {action.kind === "resize" && (
        <div className="mt-2 flex gap-1">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTierPick(t)}
              className={`flex-1 text-[10px] px-1.5 py-1 rounded-md border transition-colors capitalize ${
                tierPick === t
                  ? "bg-violet-500/20 border-violet-500/50 text-violet-700 dark:text-violet-300"
                  : "border-[color:var(--border-default)] text-[var(--fg-tertiary)] hover:bg-[var(--bg-muted)]/50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          disabled={busy || (action.kind === "resize" && tierPick === action.currentTier)}
          onClick={onConfirm}
          className="text-[11px] px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25 border border-violet-500/30 transition-colors disabled:opacity-50"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="ml-auto text-[11px] px-2 py-1 text-[var(--fg-tertiary)]/60 hover:text-[var(--fg-primary)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
