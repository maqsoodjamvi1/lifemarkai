
import { Code2, X } from "lucide-react";
import type { ParsedLineRef } from "@/lib/editor/parse-line-refs";
import { formatLineRefLabel } from "@/lib/editor/parse-line-refs";

interface LovableComposerLineRefChipsProps {
  refs: ParsedLineRef[];
  onRemove: (raw: string) => void;
  onOpenAtLine?: (path: string, line: number) => void;
}

/** Visual chips for `@file.tsx:12-34` line references in the composer (Lovable parity). */
export function LovableComposerLineRefChips({ refs, onRemove, onOpenAtLine }: LovableComposerLineRefChipsProps) {
  if (!refs.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-2">
      {refs.map((ref) => (
        <div
          key={ref.raw}
          className="flex items-center gap-1 bg-sky-500/10 border border-sky-500/25 text-sky-700 dark:text-sky-300 text-[10px] rounded-md px-2 py-0.5"
          title={`Line reference — ${ref.path}`}
        >
          <button
            type="button"
            onClick={() => onOpenAtLine?.(ref.path, ref.startLine)}
            className="flex items-center gap-1 hover:text-sky-100 transition-colors"
          >
            <Code2 className="w-2.5 h-2.5 shrink-0" />
            <span className="font-mono max-w-[140px] truncate">{formatLineRefLabel(ref)}</span>
          </button>
          <button
            type="button"
            onClick={() => onRemove(ref.raw)}
            className="ml-0.5 text-sky-400/60 hover:text-sky-200 transition-colors"
            aria-label="Remove line reference"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
