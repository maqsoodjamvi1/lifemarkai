"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Loader2 } from "lucide-react";

export interface LovableAnalyzeFileAttachment {
  name: string;
  base64: string;
  mimeType: string;
}

interface LovableComposerAnalyzeModalProps {
  open: boolean;
  instruction: string;
  file: LovableAnalyzeFileAttachment | null;
  running: boolean;
  onInstructionChange: (value: string) => void;
  onFileSelect: (file: LovableAnalyzeFileAttachment) => void;
  onFileClear: () => void;
  onClose: () => void;
  onRun: () => void;
  onFileTooLarge?: () => void;
}

export function LovableComposerAnalyzeModal({
  open,
  instruction,
  file,
  running,
  onInstructionChange,
  onFileSelect,
  onFileClear,
  onClose,
  onRun,
  onFileTooLarge,
}: LovableComposerAnalyzeModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !running && onClose()}
        >
          <motion.div
            initial={{ scale: 0.95, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
          >
            <div className="px-5 pt-4 pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold">Analyze data</h3>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Drop a CSV / Excel / image / JSON file and tell the AI what to do. It writes a Python script, runs it
                in a sandbox, and returns the generated files (PDF, XLSX, charts, etc.).
              </p>
            </div>
            <div className="px-5 py-3 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Instruction</label>
                <textarea
                  value={instruction}
                  onChange={(e) => onInstructionChange(e.target.value)}
                  rows={3}
                  placeholder="e.g. Summarize this CSV, generate a bar chart of the top 10 rows by revenue, and produce a PDF report."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                  maxLength={2000}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                  Input file <span className="text-muted-foreground/50">(optional, ≤ 20 MB)</span>
                </label>
                {file ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 text-xs">
                    <span className="flex-1 truncate font-mono">{file.name}</span>
                    <button type="button" onClick={onFileClear} className="text-muted-foreground hover:text-foreground text-[11px]">
                      Remove
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept=".csv,.tsv,.json,.xlsx,.xls,.txt,.png,.jpg,.jpeg,.pdf"
                    onChange={(e) => {
                      const picked = e.target.files?.[0];
                      if (!picked) return;
                      if (picked.size > 20 * 1024 * 1024) {
                        onFileTooLarge?.();
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        const result = reader.result as string;
                        const idx = result.indexOf(",");
                        const base64 = idx >= 0 ? result.slice(idx + 1) : result;
                        onFileSelect({
                          name: picked.name,
                          base64,
                          mimeType: picked.type || "application/octet-stream",
                        });
                      };
                      reader.readAsDataURL(picked);
                    }}
                    className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:bg-muted/30 file:text-xs file:cursor-pointer hover:file:bg-muted/50"
                  />
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border/60 flex items-center justify-end gap-2 bg-muted/10">
              <button
                onClick={onClose}
                disabled={running}
                className="h-8 px-3 text-xs rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={onRun}
                disabled={!instruction.trim() || running}
                className="h-8 px-3 text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {running ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {running ? "Running…" : "Analyze"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
