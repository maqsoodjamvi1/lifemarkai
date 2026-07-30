
import { motion } from "framer-motion";
import { FileCode, XCircle } from "lucide-react";

interface LovableComposerAttachedTextChipProps {
  name: string;
  lineCount: number;
  onRemove: () => void;
}

export function LovableComposerAttachedTextChip({ name, lineCount, onRemove }: LovableComposerAttachedTextChipProps) {
  return (
    <div className="mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-muted/50 max-w-full">
      <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
      <span className="text-xs text-foreground font-mono truncate flex-1">{name}</span>
      <span className="text-[10px] text-muted-foreground shrink-0">{lineCount} lines</span>
      <button onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
        <XCircle className="w-3 h-3" />
      </button>
    </div>
  );
}
