"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlignLeft, AlignCenter, AlignRight, X, Check, Wand2, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyVisualEdit, buildVisualEditPrompt, type VisualEditChange } from "@/lib/editor/apply-visual-edit";
import type { ProjectFile } from "@/types/database";

export interface SelectedElement {
  tagName: string;
  textContent: string;
  classList: string[];
  xpath: string;
  rect: { top: number; left: number; width: number; height: number };
}

const TAILWIND_COLORS = [
  "text-white", "text-black", "text-gray-500", "text-red-500",
  "text-blue-500", "text-green-500", "text-yellow-500", "text-purple-500",
  "text-pink-500", "text-indigo-500", "text-orange-500", "text-teal-500",
];

const TAILWIND_SIZES = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl"];
const TAILWIND_WEIGHTS = ["font-normal", "font-medium", "font-semibold", "font-bold", "font-extrabold"];

const BG_COLORS = [
  "bg-transparent", "bg-white", "bg-black", "bg-gray-100",
  "bg-blue-500", "bg-green-500", "bg-red-500", "bg-yellow-500",
  "bg-purple-500", "bg-indigo-500", "bg-pink-500", "bg-gradient-brand",
];

// ── Shared edit logic ─────────────────────────────────────────────────────────

/**
 * Apply a visual edit to source files (multi-file aware). When the
 * deterministic matcher can't find a unique target, falls back to a precise
 * AI edit prompt via onRequestAiEdit (when provided).
 * Returns true when the edit was applied directly.
 */
function applyChangeToFiles(
  files: ProjectFile[],
  selected: SelectedElement,
  change: VisualEditChange,
  onFileChange: (path: string, content: string) => void,
  onRequestAiEdit?: (prompt: string) => void
): boolean {
  const result = applyVisualEdit(files, selected, change);
  if (result) {
    onFileChange(result.path, result.content);
    return true;
  }
  onRequestAiEdit?.(buildVisualEditPrompt(selected, change));
  return false;
}

// ── Shared popover UI ─────────────────────────────────────────────────────────

export function VebEditPopover({
  selection,
  position,
  onApply,
  onClose,
  aiFallbackAvailable,
}: {
  selection: SelectedElement;
  position: { x: number; y: number };
  onApply: (change: VisualEditChange) => void;
  onClose: () => void;
  /** Show a hint that unmatched edits are sent to the AI */
  aiFallbackAvailable?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"text" | "colors" | "spacing">("text");
  const [editText, setEditText] = useState(selection.textContent);
  const [editClasses, setEditClasses] = useState(selection.classList.join(" "));

  // Reset edit fields when a different element is selected — React's
  // "adjust state during render" pattern (no effect → no cascading render).
  const [prevSelection, setPrevSelection] = useState(selection);
  if (prevSelection !== selection) {
    setPrevSelection(selection);
    setEditText(selection.textContent);
    setEditClasses(selection.classList.join(" "));
  }

  function addClass(cls: string) {
    const updated = editClasses.includes(cls)
      ? editClasses.split(" ").filter((c) => c !== cls).join(" ")
      : (editClasses + " " + cls).trim();
    setEditClasses(updated);
    onApply({ classes: updated });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed z-50 bg-popover border border-border rounded-2xl shadow-2xl w-72"
        style={{
          left: Math.max(8, Math.min(position.x - 136, (typeof window !== "undefined" ? window.innerWidth : 1280) - 288)),
          top: Math.max(8, Math.min(position.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 400)),
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium">
              &lt;{selection.tagName}&gt;
            </span>
          </div>
          <Button variant="ghost" size="icon" className="w-6 h-6" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["text", "colors", "spacing"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "text-foreground border-b-2 border-violet-500"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-3 space-y-3">
          {activeTab === "text" && (
            <>
              {/* Text content */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Content</label>
                <div className="flex gap-1">
                  <Input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="h-8 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && onApply({ text: editText })}
                  />
                  <Button size="icon" className="w-8 h-8 shrink-0" onClick={() => onApply({ text: editText })}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Text size */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Size</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_SIZES.map((cls) => (
                    <button
                      key={cls}
                      onClick={() => addClass(cls)}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      {cls.replace("text-", "")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text weight */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Weight</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_WEIGHTS.map((cls) => (
                    <button
                      key={cls}
                      onClick={() => addClass(cls)}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      {cls.replace("font-", "")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alignment */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Align</label>
                <div className="flex gap-1">
                  {[
                    { cls: "text-left", Icon: AlignLeft },
                    { cls: "text-center", Icon: AlignCenter },
                    { cls: "text-right", Icon: AlignRight },
                  ].map(({ cls, Icon }) => (
                    <button
                      key={cls}
                      onClick={() => addClass(cls)}
                      className={`flex-1 flex items-center justify-center py-1.5 rounded border transition-colors ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "colors" && (
            <>
              {/* Text color */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Text color</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_COLORS.map((cls) => (
                    <button
                      key={cls}
                      onClick={() => addClass(cls)}
                      className={`w-7 h-7 rounded border-2 transition-all ${cls} bg-gray-800 flex items-center justify-center ${
                        editClasses.includes(cls) ? "border-violet-500 scale-110" : "border-border"
                      }`}
                      title={cls}
                    >
                      A
                    </button>
                  ))}
                </div>
              </div>

              {/* Background color */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Background</label>
                <div className="flex flex-wrap gap-1">
                  {BG_COLORS.map((cls) => (
                    <button
                      key={cls}
                      onClick={() => addClass(cls)}
                      className={`w-7 h-7 rounded border-2 transition-all ${cls} ${
                        editClasses.includes(cls) ? "border-violet-500 scale-110" : "border-border"
                      }`}
                      title={cls}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "spacing" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tailwind classes</label>
              <div className="flex gap-1">
                <Input
                  value={editClasses}
                  onChange={(e) => setEditClasses(e.target.value)}
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. p-4 m-2 rounded-xl"
                />
                <Button size="icon" className="w-8 h-8 shrink-0" onClick={() => onApply({ classes: editClasses })}>
                  <Check className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Enter any Tailwind CSS classes directly.
              </p>
            </div>
          )}

          {aiFallbackAvailable && (
            <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 pt-1 border-t border-border/60">
              <Sparkles className="w-3 h-3 shrink-0" />
              Edits that can&apos;t be matched in code are sent to the AI automatically.
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── DOM mode (same-origin srcdoc fallback engine) ─────────────────────────────

interface VisualEditOverlayProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  files: ProjectFile[];
  onFileChange: (path: string, content: string) => void;
  enabled: boolean;
  /** Optional: route unmatched edits to the AI chat as a precise prompt */
  onRequestAiEdit?: (prompt: string) => void;
}

export function VisualEditOverlay({ iframeRef, files, onFileChange, enabled, onRequestAiEdit }: VisualEditOverlayProps) {
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });

  const injectOverlayScript = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;

    // Remove existing overlay
    doc.getElementById("lifemark-overlay")?.remove();

    // Inject CSS
    const style = doc.createElement("style");
    style.id = "lifemark-overlay";
    style.textContent = `
      .lifemark-hover { outline: 2px solid #7c3aed !important; outline-offset: 2px; cursor: pointer !important; }
      .lifemark-selected { outline: 2px solid #0e90e8 !important; outline-offset: 2px; }
      * { transition: outline 0.1s ease; }
    `;
    doc.head.appendChild(style);

    // Mouse events
    const handleMouseOver = (e: MouseEvent) => {
      if (!enabled) return;
      const el = e.target as HTMLElement;
      if (el.id === "lifemark-overlay") return;
      document.querySelectorAll(".lifemark-hover").forEach((el) => el.classList.remove("lifemark-hover"));
      el.classList.add("lifemark-hover");
    };

    const handleMouseOut = (e: MouseEvent) => {
      (e.target as HTMLElement).classList.remove("lifemark-hover");
    };

    const handleClick = (e: MouseEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.target as HTMLElement;
      const rect = el.getBoundingClientRect();
      const iframeRect = iframe.getBoundingClientRect();

      setSelected({
        tagName: el.tagName.toLowerCase(),
        textContent: el.textContent ?? "",
        classList: Array.from(el.classList).filter((c) => !c.startsWith("lifemark-")),
        xpath: getXPath(el, doc),
        rect: {
          top: rect.top + iframeRect.top,
          left: rect.left + iframeRect.left,
          width: rect.width,
          height: rect.height,
        },
      });
      setPopoverPos({
        x: rect.left + iframeRect.left + rect.width / 2,
        y: rect.top + iframeRect.top + rect.height + 8,
      });

      doc.querySelectorAll(".lifemark-selected").forEach((el) => el.classList.remove("lifemark-selected"));
      el.classList.add("lifemark-selected");
    };

    doc.addEventListener("mouseover", handleMouseOver);
    doc.addEventListener("mouseout", handleMouseOut);
    doc.addEventListener("click", handleClick, true);

    return () => {
      doc.removeEventListener("mouseover", handleMouseOver);
      doc.removeEventListener("mouseout", handleMouseOut);
      doc.removeEventListener("click", handleClick, true);
    };
  }, [enabled, iframeRef]);

  // Clear the selection when the overlay is toggled off — adjust-state-during-
  // render pattern keeps setState out of the effect body (react-hooks v7 rule).
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (prevEnabled !== enabled) {
    setPrevEnabled(enabled);
    if (!enabled) setSelected(null);
  }

  useEffect(() => {
    if (!enabled) return;
    const cleanup = injectOverlayScript();
    return cleanup;
  }, [enabled, injectOverlayScript]);

  if (!enabled || !selected) return null;

  return (
    <>
      {/* Selection border */}
      <div
        className="fixed pointer-events-none z-40 border-2 border-blue-500 rounded"
        style={{
          top: selected.rect.top,
          left: selected.rect.left,
          width: selected.rect.width,
          height: selected.rect.height,
        }}
      />

      <VebEditPopover
        selection={selected}
        position={popoverPos}
        onClose={() => setSelected(null)}
        aiFallbackAvailable={!!onRequestAiEdit}
        onApply={(change) => {
          applyChangeToFiles(files, selected, change, onFileChange, onRequestAiEdit);
          // Keep local selection state in sync so follow-up edits chain correctly
          setSelected((prev) =>
            prev
              ? {
                  ...prev,
                  textContent: change.text !== undefined ? change.text : prev.textContent,
                  classList: change.classes !== undefined ? change.classes.split(" ").filter(Boolean) : prev.classList,
                }
              : prev
          );
        }}
      />
    </>
  );
}

// ── Bridge mode (cross-origin WebContainer engine) ────────────────────────────

interface VebBridgePopoverProps {
  selection: SelectedElement;
  files: ProjectFile[];
  onFileChange: (path: string, content: string) => void;
  /** Send a live-apply command to the preview iframe for instant feedback */
  onLiveApply: (payload: { xpath: string; text?: string; classes?: string }) => void;
  onRequestAiEdit?: (prompt: string) => void;
  onClose: () => void;
  onSelectionChange?: (next: SelectedElement) => void;
}

export function VebBridgePopover({
  selection,
  files,
  onFileChange,
  onLiveApply,
  onRequestAiEdit,
  onClose,
  onSelectionChange,
}: VebBridgePopoverProps) {
  return (
    <>
      {/* Selection border */}
      <div
        className="fixed pointer-events-none z-40 border-2 border-blue-500 rounded"
        style={{
          top: selection.rect.top,
          left: selection.rect.left,
          width: selection.rect.width,
          height: selection.rect.height,
        }}
      />

      <VebEditPopover
        selection={selection}
        position={{
          x: selection.rect.left + selection.rect.width / 2,
          y: selection.rect.top + selection.rect.height + 8,
        }}
        onClose={onClose}
        aiFallbackAvailable={!!onRequestAiEdit}
        onApply={(change) => {
          // 1. Instant DOM feedback inside the (cross-origin) preview
          onLiveApply({ xpath: selection.xpath, text: change.text, classes: change.classes });
          // 2. Persist to source files (or AI fallback when not uniquely matchable)
          applyChangeToFiles(files, selection, change, onFileChange, onRequestAiEdit);
          // 3. Keep selection in sync for chained edits
          onSelectionChange?.({
            ...selection,
            textContent: change.text !== undefined ? change.text : selection.textContent,
            classList: change.classes !== undefined ? change.classes.split(" ").filter(Boolean) : selection.classList,
          });
        }}
      />
    </>
  );
}

function getXPath(el: HTMLElement, doc: Document): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== doc.body) {
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(current.parentElement?.children ?? []).filter((c) => c.tagName === current!.tagName);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}[${index}]` : tag);
    current = current.parentElement;
  }
  return `//${parts.join("/")}`;
}
