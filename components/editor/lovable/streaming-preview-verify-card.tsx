"use client";

export interface PreviewVerifyResult {
  ok: boolean;
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
}

interface LovableStreamingPreviewVerifyCardProps {
  result: PreviewVerifyResult;
}

/** Inline preview verification summary during streaming builds. */
export function LovableStreamingPreviewVerifyCard({ result }: LovableStreamingPreviewVerifyCardProps) {
  return (
    <div
      className={`rounded-[var(--radius-3)] border overflow-hidden mb-1 ${
        result.ok ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="px-3 py-2 text-xs font-[500]">
        {result.ok ? "Preview verified" : "Preview check — review suggested"}
      </div>
      <div className="px-3 pb-2 space-y-0.5">
        {result.checks.map((c) => (
          <div key={c.name} className="text-[10px] text-[var(--fg-tertiary)] flex gap-1.5">
            <span className={c.pass ? "text-green-400" : "text-amber-400"}>{c.pass ? "✓" : "!"}</span>
            <span>
              {c.name}
              {c.detail ? ` — ${c.detail}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
