"use client";

import { Wand2 } from "lucide-react";

/** Lovable-parity drag-and-drop overlay on the composer. */
export function LovableComposerDropOverlay() {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[var(--radius-6)] border-2 border-dashed border-violet-500 bg-violet-500/10 backdrop-blur-[1px] pointer-events-none">
      <div className="flex flex-col items-center gap-1.5 text-violet-400">
        <Wand2 className="w-6 h-6" />
        <span className="text-xs font-semibold">Drop mockup or file</span>
        <span className="text-[10px] text-violet-400/70">Image → AI generates matching UI</span>
      </div>
    </div>
  );
}
