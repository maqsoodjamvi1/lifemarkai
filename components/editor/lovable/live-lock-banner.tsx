"use client";

import { Globe } from "lucide-react";

/** Lovable-parity Live environment lock strip above the composer. */
export function LovableLiveLockBanner() {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border-t border-emerald-500/20">
      <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      <span className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-snug">
        <span className="font-semibold">Live environment</span> — AI edits are locked.
        Switch back to <span className="font-semibold">Test</span> in the top bar to make changes.
      </span>
    </div>
  );
}
