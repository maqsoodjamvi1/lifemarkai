"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface LovableQueueItem {
  id: string;
  text: string;
  repeat: number;
  remaining: number;
}

interface LovablePromptQueueProps {
  items: LovableQueueItem[];
  streaming: boolean;
  paused: boolean;
  editingId: string | null;
  editingText: string;
  onTogglePause: () => void;
  onClearAll: () => void;
  onMoveUp: (idx: number) => void;
  onMoveDown: (idx: number) => void;
  onStartEdit: (id: string, text: string) => void;
  onEditingTextChange: (text: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onCycleRepeat: (id: string) => void;
  onRemove: (id: string) => void;
}

const REPEAT_STEPS = [1, 2, 3, 5, 10, 25, 50];

/** Lovable-parity prompt queue above the composer while AI is busy. */
export function LovablePromptQueue({
  items,
  streaming,
  paused,
  editingId,
  editingText,
  onTogglePause,
  onClearAll,
  onMoveUp,
  onMoveDown,
  onStartEdit,
  onEditingTextChange,
  onSaveEdit,
  onCancelEdit,
  onCycleRepeat,
  onRemove,
}: LovablePromptQueueProps) {
  if (items.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="overflow-hidden border-t border-[color:var(--border-default)]"
      >
        <div className="mx-3 mt-2 mb-1 rounded-[var(--radius-3)] border border-[color:var(--border-default)] bg-[var(--bg-secondary-pulse)] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-muted)] border-b border-[color:var(--border-default)]">
            <span className="text-[11px] font-[500] text-[var(--fg-tertiary)]">
              Queue · {items.length} waiting
            </span>
            {streaming && (
              <span className="flex items-center gap-1 text-[10px] text-[var(--fg-accent)]">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Processing…
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={onTogglePause}
                className="flex items-center gap-1 h-5 px-2 rounded text-[10px] text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)] transition-colors"
                title={paused ? "Resume queue" : "Pause queue"}
              >
                {paused ? (
                  <>
                    <Play className="w-2.5 h-2.5" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-2.5 h-2.5" />
                    Pause
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onClearAll}
                className="h-5 px-2 rounded text-[10px] text-[var(--fg-tertiary)] hover:text-destructive hover:bg-[var(--bg-muted)] transition-colors"
                title="Clear all queued prompts"
              >
                Clear all
              </button>
            </div>
          </div>

          <div className="divide-y divide-[color:var(--border-default)] max-h-44 overflow-y-auto">
            {items.map((item, idx) => (
              <div key={item.id} className="flex items-start gap-1.5 px-2 py-2 group">
                <div className="flex flex-col gap-0.5 mt-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onMoveUp(idx)}
                    disabled={idx === 0}
                    className="p-0.5 rounded hover:bg-[var(--bg-muted)] disabled:opacity-20 transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="w-2.5 h-2.5 text-[var(--fg-tertiary)]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveDown(idx)}
                    disabled={idx === items.length - 1}
                    className="p-0.5 rounded hover:bg-[var(--bg-muted)] disabled:opacity-20 transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="w-2.5 h-2.5 text-[var(--fg-tertiary)]" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  {editingId === item.id ? (
                    <div className="space-y-1">
                      <Textarea
                        value={editingText}
                        onChange={(e) => onEditingTextChange(e.target.value)}
                        className="text-xs bg-background border-[color:var(--border-default)] resize-none min-h-[40px] py-1 px-2"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            onSaveEdit(item.id);
                          }
                          if (e.key === "Escape") onCancelEdit();
                        }}
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="h-5 text-[10px] px-2 bg-violet-600 hover:bg-violet-500 text-white"
                          onClick={() => onSaveEdit(item.id)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 text-[10px] px-2"
                          onClick={onCancelEdit}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1">
                      <span className="text-[11px] text-[var(--fg-tertiary)] leading-relaxed line-clamp-2 flex-1">
                        {item.text}
                      </span>
                      {item.repeat > 1 && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-mono">
                          &times;{item.remaining}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                  <button
                    type="button"
                    onClick={() => onStartEdit(item.id, item.text)}
                    className="p-1 rounded hover:bg-[var(--bg-muted)] transition-colors"
                    title="Edit prompt"
                  >
                    <Pencil className="w-2.5 h-2.5 text-[var(--fg-tertiary)]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCycleRepeat(item.id)}
                    className="p-1 rounded hover:bg-[var(--bg-muted)] transition-colors"
                    title={`Repeat: x${item.repeat} — click to cycle`}
                  >
                    <RefreshCw
                      className={`w-2.5 h-2.5 ${item.repeat > 1 ? "text-violet-400" : "text-[var(--fg-tertiary)]"}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(item.text)}
                    className="p-1 rounded hover:bg-[var(--bg-muted)] transition-colors"
                    title="Copy prompt"
                  >
                    <Copy className="w-2.5 h-2.5 text-[var(--fg-tertiary)]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="p-1 rounded hover:bg-[var(--bg-muted)] transition-colors"
                    title="Remove from queue"
                  >
                    <XCircle className="w-2.5 h-2.5 text-[var(--fg-tertiary)] hover:text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export { REPEAT_STEPS };
