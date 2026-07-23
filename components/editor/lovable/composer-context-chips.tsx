"use client";

import { Paperclip, X } from "lucide-react";

interface ContextChipFile {
  id: string;
  path: string;
}

interface LovableComposerContextChipsProps {
  files: ContextChipFile[];
  onRemove: (id: string) => void;
}

export function LovableComposerContextChips({ files, onRemove }: LovableComposerContextChipsProps) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-2">
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-1 bg-violet-500/10 border border-violet-500/20 text-violet-700 dark:text-violet-300 text-[10px] rounded-md px-2 py-0.5"
        >
          <Paperclip className="w-2.5 h-2.5 shrink-0" />
          <span className="font-mono max-w-[120px] truncate">{f.path.split("/").pop()}</span>
          <button
            onClick={() => onRemove(f.id)}
            className="ml-0.5 text-violet-400/60 hover:text-violet-300 transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
