"use client";

import { SearchX } from "lucide-react";

interface LovableSearchEmptyProps {
  query: string;
  mode?: "keyword" | "semantic";
}

/** Empty state when chat search returns no matches. */
export function LovableSearchEmpty({ query, mode = "keyword" }: LovableSearchEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center px-4">
      <SearchX className="w-8 h-8 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground/70">No messages match your search</p>
      <p className="text-xs text-muted-foreground/45 mt-1 max-w-sm truncate" title={query}>
        “{query}”{mode === "semantic" ? " · semantic" : ""}
      </p>
      <p className="text-[10px] text-muted-foreground/35 mt-2">Try different keywords or switch to Text search</p>
    </div>
  );
}
