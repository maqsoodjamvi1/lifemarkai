import { useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  Wand2,
  X,
} from "lucide-react";
import { AnimatePresence,motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectFile } from "@/types/database";

const TAILWIND_SIZES = [
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
];
const TAILWIND_WEIGHTS = [
  "font-normal",
  "font-medium",
  "font-semibold",
  "font-bold",
  "font-extrabold",
];
const TAILWIND_COLORS = [
  "text-white",
  "text-black",
  "text-gray-500",
  "text-red-500",
  "text-blue-500",
  "text-green-500",
  "text-yellow-500",
  "text-purple-500",
];

export interface VebElement {
  tagName: string;
  textContent: string;
  classList: string[];
  xpath: string;
  rect: { top: number; left: number; width: number; height: number };
}

/** Focused renderer for visual-edit selection and source updates. */
export interface PreviewVisualEditPopoverProps {
  selected: VebElement;
  files: ProjectFile[];
  onFileChange: (path: string, content: string) => void;
  onClose: () => void;
}

export function PreviewVisualEditPopover({
  selected,
  files,
  onFileChange,
  onClose,
}: PreviewVisualEditPopoverProps) {
  const [activeTab, setActiveTab] = useState<"text" | "colors" | "spacing">("text");
  const [editText, setEditText] = useState(selected.textContent);
  const [editClasses, setEditClasses] = useState(selected.classList.join(" "));

  const left = Math.min(selected.rect.left + selected.rect.width / 2 - 136, window.innerWidth - 288);
  const top = Math.min(selected.rect.top + selected.rect.height + 8, window.innerHeight - 420);

  function applyFileChange({ textContent, classes }: { textContent?: string; classes?: string }) {
    const appFile =
      files.find((f) => f.path.endsWith("App.tsx") || f.path.endsWith("App.jsx")) ??
      files.find((f) => f.path.endsWith("index.tsx") || f.path.endsWith("index.jsx")) ??
      files[0];
    if (!appFile) return;

    let content = appFile.content;
    if (textContent !== undefined && selected.textContent) {
      content = content.replace(selected.textContent, textContent);
    }
    if (classes !== undefined) {
      const regex = /className="([^"]*)"/g;
      let found = false;
      content = content.replace(regex, (match, existing: string) => {
        if (!found && existing === selected.classList.join(" ")) {
          found = true;
          return `className="${classes}"`;
        }
        return match;
      });
    }
    onFileChange(appFile.path, content);
  }

  function addClass(cls: string) {
    const updated = editClasses.includes(cls)
      ? editClasses.split(" ").filter((c) => c !== cls).join(" ")
      : (editClasses + " " + cls).trim();
    setEditClasses(updated);
    applyFileChange({ classes: updated });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed z-50 bg-popover border border-border rounded-2xl shadow-2xl w-72"
        style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      >
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

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium">&lt;{selected.tagName}&gt;</span>
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
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Content</label>
                <div className="flex gap-1">
                  <Input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="h-8 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && applyFileChange({ textContent: editText })}
                  />
                  <Button size="icon" className="w-8 h-8 shrink-0" onClick={() => applyFileChange({ textContent: editText })}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Size</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_SIZES.map((cls) => (
                    <button key={cls} onClick={() => addClass(cls)}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-700 dark:text-violet-300"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      {cls.replace("text-", "")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Weight</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_WEIGHTS.map((cls) => (
                    <button key={cls} onClick={() => addClass(cls)}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-700 dark:text-violet-300"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      {cls.replace("font-", "")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Align</label>
                <div className="flex gap-1">
                  {[
                    { cls: "text-left", Icon: AlignLeft },
                    { cls: "text-center", Icon: AlignCenter },
                    { cls: "text-right", Icon: AlignRight },
                  ].map(({ cls, Icon }) => (
                    <button key={cls} onClick={() => addClass(cls)}
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
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Text color</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_COLORS.map((cls) => (
                    <button
                      key={cls}
                      onClick={() => addClass(cls)}
                      title={cls}
                      className={`w-6 h-6 rounded border border-border/40 transition-all hover:scale-110 bg-${cls.replace("text-","").replace("bg-","")}`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

