"use client";

import { Bookmark } from "lucide-react";

/** Empty state when bookmarks filter is active but none exist. */
export function LovableBookmarksEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Bookmark className="w-8 h-8 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground/60">No bookmarks yet</p>
      <p className="text-xs text-muted-foreground/40 mt-1">Click the bookmark icon on any message card</p>
    </div>
  );
}
