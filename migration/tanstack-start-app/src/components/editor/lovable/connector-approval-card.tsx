
import { AlertCircle } from "lucide-react";

export interface ConnectorApprovalRequest {
  connector: string;
  method: string;
  path: string;
  retryPrompt: string;
}

interface LovableConnectorApprovalCardProps {
  approval: ConnectorApprovalRequest;
  busy: boolean;
  onAllow: (decision: "once" | "always") => void;
  onNeverAllow: () => void;
  onSkip: () => void;
}

/** Lovable-parity connector permission gate above the composer. */
export function LovableConnectorApprovalCard({
  approval,
  busy,
  onAllow,
  onNeverAllow,
  onSkip,
}: LovableConnectorApprovalCardProps) {
  return (
    <div className="mb-2 rounded-[var(--radius-3)] border border-cyan-500/30 bg-cyan-500/5 px-3 py-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="text-xs font-medium text-[var(--fg-primary)]/90">
          The agent wants to use the <span className="text-cyan-400">{approval.connector}</span> connector
        </span>
      </div>
      <div className="mt-1 text-[11px] font-mono text-[var(--fg-tertiary)] truncate">
        {approval.method} {approval.path}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {(["once", "always"] as const).map((decision) => (
          <button
            key={decision}
            type="button"
            disabled={busy}
            onClick={() => onAllow(decision)}
            className="text-[11px] px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30 transition-colors disabled:opacity-50"
          >
            {decision === "once" ? "Allow once" : "Always allow"}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={onNeverAllow}
          className="text-[11px] px-2.5 py-1 rounded-full border border-[color:var(--border-default)] text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)]/60 transition-colors disabled:opacity-50"
        >
          Never allow
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSkip}
          className="ml-auto text-[11px] px-2 py-1 text-[var(--fg-tertiary)]/60 hover:text-[var(--fg-primary)] transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
