"use client";

import { Brain } from "lucide-react";

interface LovableContextSummaryBannerProps {
  coversLabel?: string | number | null;
}

export function LovableContextSummaryBanner({ coversLabel }: LovableContextSummaryBannerProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-violet-500/5 border-b border-violet-500/15 text-[11px] text-muted-foreground">
      <Brain className="w-3 h-3 text-violet-400 flex-shrink-0" />
      <span>
        <span className="text-violet-400 font-medium">Context summarised</span>
        {" · "}
        {coversLabel ?? "Earlier"} messages compressed to keep AI focused
      </span>
    </div>
  );
}
