"use client";

import { Globe } from "lucide-react";

interface LovablePreviewSnapshotCardProps {
  messageId: string;
  src: string;
}

export function LovablePreviewSnapshotCard({ messageId, src }: LovablePreviewSnapshotCardProps) {
  return (
    <div className="w-full mt-1.5 rounded-lg overflow-hidden border border-border/50 bg-muted/10 group/thumb">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1.5">
          <Globe className="w-3 h-3" />
          Preview snapshot
        </span>
        <button
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("lifemark-request-screenshot", { detail: { messageId } }),
            )
          }
          className="text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-white/10"
          title="Re-capture current preview"
        >
          Refresh
        </button>
      </div>
      <div className="relative overflow-hidden max-h-36 group-hover/thumb:max-h-64 transition-all duration-300">
        <img
          src={src}
          alt="App preview at this point in time"
          className="w-full h-auto object-cover object-top"
          style={{ imageRendering: "crisp-edges" }}
        />
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background/80 to-transparent group-hover/thumb:opacity-0 transition-opacity pointer-events-none" />
      </div>
    </div>
  );
}
