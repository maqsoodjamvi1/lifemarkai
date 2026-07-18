"use client";

import { Shield } from "lucide-react";

interface LovableSecurityIssuesBarProps {
  issueCount: number;
  noCredits: boolean;
  onViewIssues: () => void;
  onFixAll: () => void;
}

/** Lovable-parity "N security issues · Try to fix all" strip above the composer. */
export function LovableSecurityIssuesBar({
  issueCount,
  noCredits,
  onViewIssues,
  onFixAll,
}: LovableSecurityIssuesBarProps) {
  if (issueCount <= 0) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-[color:var(--border-default)] bg-[var(--bg-secondary-pulse)]">
      <Shield className="w-3.5 h-3.5 shrink-0 text-amber-500" />
      <span className="text-xs font-medium text-[var(--fg-primary)]">Security</span>
      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-amber-500/15 text-amber-500">
        {issueCount} {issueCount === 1 ? "issue" : "issues"}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onViewIssues}
        className="h-7 rounded-full px-3 text-xs font-normal text-[var(--fg-primary)] transition-colors hover:bg-[var(--bg-muted)]"
      >
        View issues
      </button>
      <button
        type="button"
        onClick={onFixAll}
        disabled={noCredits}
        className="h-7 rounded-full px-3 text-xs font-medium text-[var(--fg-inverse)] bg-[var(--bg-inverse)] transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Try to fix all
      </button>
    </div>
  );
}
