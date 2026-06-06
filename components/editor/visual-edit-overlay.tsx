"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Type, Palette, Maximize2, AlignLeft, AlignCenter,
  AlignRight, Bold, Italic, X, Check, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectFile } from "@/types/database";

interface SelectedElement {
  tagName: string;
  textContent: string;
  classList: string[];
  xpath: string;
  rect: { top: number; left: number; width: number; height: number };
}

interface VisualEditOverlayProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  files: ProjectFile[];
  onFileChange: (path: string, content: string) => void;
  enabled: boolean;
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

export function VisualEditOverlay({ iframeRef, files, onFileChange, enabled }: VisualEditOverlayProps) {
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState<"text" | "colors" | "spacing">("text");
  const [editText, setEditText] = useState("");
  const [editClasses, setEditClasses] = useState("");

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
        classList: Array.from(el.classList),
        xpath: getXPath(el, doc),
        rect: {
          top: rect.top + iframeRect.top,
          left: rect.left + iframeRect.left,
          width: rect.width,
          height: rect.height,
        },
      });
      setEditText(el.textContent ?? "");
      setEditClasses(Array.from(el.classList).join(" "));
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

  useEffect(() => {
    if (!enabled) {
      setSelected(null);
      return;
    }
    const cleanup = injectOverlayScript();
    return cleanup;
  }, [enabled, injectOverlayScript]);

  function applyTextChange() {
    if (!selected) return;
    applyFileChange({ textContent: editText });
  }

  function applyClassChange(oldClass: string, newClass: string) {
    if (!selected) return;
    const updated = editClasses
      .split(" ")
      .filter((c) => c !== oldClass)
      .concat(newClass ? [newClass] : [])
      .join(" ");
    setEditClasses(updated);
    applyFileChange({ classes: updated });
  }

  function addClass(cls: string) {
    const updated = editClasses.includes(cls)
      ? editClasses.split(" ").filter((c) => c !== cls).join(" ")
      : (editClasses + " " + cls).trim();
    setEditClasses(updated);
    applyFileChange({ classes: updated });
  }

  function applyFileChange({ textContent, classes }: { textContent?: string; classes?: string }) {
    if (!selected) return;
    // Find the file containing this element and update it
    const appFile = files.find((f) => f.path.endsWith("App.tsx") || f.path.endsWith("App.jsx") || f.path.endsWith("index.tsx"));
    if (!appFile) return;

    let content = appFile.content;

    if (textContent !== undefined && selected.textContent) {
      content = content.replace(selected.textContent, textContent);
    }

    if (classes !== undefined) {
      const classAttrRegex = /className="([^"]*)"/g;
      let found = false;
      content = content.replace(classAttrRegex, (match, existing: string) => {
        if (!found && existing === selected.classList.join(" ")) {
          found = true;
          return `className="${classes}"`;
        }
        return match;
      });
    }

    onFileChange(appFile.path, content);
  }

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

      {/* Edit Popover */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="fixed z-50 bg-popover border border-border rounded-2xl shadow-2xl w-72"
          style={{
            left: Math.min(popoverPos.x - 136, window.innerWidth - 288),
            top: Math.min(popoverPos.y, window.innerHeight - 400),
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-medium">
                &lt;{selected.tagName}&gt;
              </span>
            </div>
            <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setSelected(null)}>
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
                      onKeyDown={(e) => e.key === "Enter" && applyTextChange()}
                    />
                    <Button size="icon" className="w-8 h-8 shrink-0" onClick={applyTextChange}>
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
                  <Button size="icon" className="w-8 h-8 shrink-0" onClick={() => applyFileChange({ classes: editClasses })}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Enter any Tailwind CSS classes directly.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
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
