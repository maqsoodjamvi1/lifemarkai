"use client";

import { motion } from "framer-motion";
import { Download, FileDown, X } from "lucide-react";

export interface LovableFileGenResult {
  id: string;
  filename: string;
  prompt: string;
  content: string;
  mimeType?: string;
  /** When true, `content` is raw base64 (binary outputs from analyze sandbox). */
  base64?: boolean;
}

interface LovableFileGenResultCardsProps {
  results: LovableFileGenResult[];
  formatSize: (content: string) => string;
  onDownload: (file: LovableFileGenResult) => void;
  onDismiss: (id: string) => void;
}

export function LovableFileGenResultCards({
  results,
  formatSize,
  onDownload,
  onDismiss,
}: LovableFileGenResultCardsProps) {
  if (!results.length) return null;
  return (
    <div className="mx-3 mb-2 space-y-1.5">
      {results.map((f) => (
        <motion.div
          key={f.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-stretch gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 max-w-full"
        >
          <div className="w-10 h-10 rounded-lg bg-background border border-border/60 flex items-center justify-center flex-shrink-0">
            <FileDown className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="text-xs font-medium text-foreground truncate" title={f.filename}>
              {f.filename}
            </p>
            <p className="text-[10px] text-muted-foreground truncate" title={f.prompt}>
              {formatSize(f.content, f.base64)} · {f.prompt}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onDownload(f)}
              className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Download file"
            >
              <Download className="w-3 h-3" />
              Download
            </button>
            <button
              onClick={() => onDismiss(f.id)}
              className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
