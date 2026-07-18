"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileCode2, XCircle, Zap } from "lucide-react";
import type { ProjectFile } from "@/types/database";

interface LovableComposerContextFilePickerProps {
  open: boolean;
  files: ProjectFile[];
  contextFiles: ProjectFile[];
  search: string;
  maxFiles: number;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  onToggleFile: (file: ProjectFile) => void;
  onClearAll: () => void;
}

export function LovableComposerContextFilePicker({
  open,
  files,
  contextFiles,
  search,
  maxFiles,
  onSearchChange,
  onClose,
  onToggleFile,
  onClearAll,
}: LovableComposerContextFilePickerProps) {
  const filtered = files.filter(
    (f) => !search || f.path.toLowerCase().includes(search.toLowerCase()),
  );
  const atLimit = contextFiles.length >= maxFiles;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">Attach files as context</span>
              <span
                className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-medium ${
                  atLimit ? "bg-amber-500/15 text-amber-400" : "bg-muted text-muted-foreground"
                }`}
              >
                {contextFiles.length}/{maxFiles}
              </span>
            </div>
            <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground">
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-3 py-1.5 border-b border-border/60">
            <input
              autoFocus
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter files…"
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none font-mono"
            />
          </div>
          {atLimit && (
            <div className="px-3 py-1.5 text-[10px] text-amber-400 bg-amber-500/5 border-b border-border/40 flex items-center gap-1.5">
              <Zap className="w-3 h-3 shrink-0" />
              Max {maxFiles} files — remove one to add another
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {files.length === 0 && (
              <p className="text-xs text-muted-foreground px-3 py-3">No project files available</p>
            )}
            {files.length > 0 && filtered.length === 0 && (
              <p className="text-xs text-muted-foreground px-3 py-3">No files match &quot;{search}&quot;</p>
            )}
            {filtered.map((f) => {
              const attached = contextFiles.some((cf) => cf.id === f.id);
              const disabled = atLimit && !attached;
              return (
                <button
                  key={f.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (disabled) return;
                    onToggleFile(f);
                  }}
                  disabled={disabled}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                    attached
                      ? "bg-violet-500/10 text-violet-300"
                      : disabled
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-muted text-foreground"
                  }`}
                >
                  <FileCode2 className={`w-3 h-3 shrink-0 ${attached ? "text-violet-400" : "text-muted-foreground"}`} />
                  <span className="font-mono truncate flex-1">{f.path}</span>
                  {attached && <span className="text-[10px] text-violet-400 shrink-0">✓ attached</span>}
                </button>
              );
            })}
          </div>
          {contextFiles.length > 0 && (
            <div className="px-3 py-1.5 border-t border-border/60 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {contextFiles.length} file{contextFiles.length !== 1 ? "s" : ""} selected
              </span>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  onClearAll();
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
