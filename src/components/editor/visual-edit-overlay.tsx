
import { useState,useEffect,useCallback,useRef } from "react";
import { motion,AnimatePresence } from "framer-motion";
import {
AlignLeft,AlignCenter,AlignRight,X,Check,Wand2,Sparkles,Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
applyArbitraryColorToken,
applyDimensionToken,
applyFontFamilyToken,
applySpacingToken,
applyVisualEdit,
buildVisualEditPrompt,
ensureResizableDisplay,
resolveDisplayHex,
type VisualEditChange,
} from "@/lib/editor/apply-visual-edit";
import type { ProjectFile } from "@/types/database";
import { toast } from "@/hooks/use-toast";

export interface SelectedElement {
  tagName: string;
  textContent: string;
  classList: string[];
  xpath: string;
  rect: { top: number; left: number; width: number; height: number };
  sourceFile?: string | null;
  sourceLine?: number | null;
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

const TAILWIND_FONT_FAMILIES: Array<{ cls: string; label: string }> = [
  { cls: "font-sans", label: "Sans" },
  { cls: "font-serif", label: "Serif" },
  { cls: "font-mono", label: "Mono" },
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

/** Fetch + cache today's free inline-edit quota (Lovable parity counter). */
function useFreeEditQuota() {
  const [quota, setQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai/inline-edit")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.remaining === "number") setQuota(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tick]);
  useEffect(() => {
    const onRefresh = () => setTick((n) => n + 1);
    window.addEventListener("lifemark-free-edit-quota", onRefresh);
    return () => window.removeEventListener("lifemark-free-edit-quota", onRefresh);
  }, []);
  return quota;
}

/** Claim one free visual edit (or debit 1 credit when quota exhausted). */
export async function claimVisualEditCredit(projectId?: string): Promise<{
  ok: boolean;
  remaining?: number;
  insufficient?: boolean;
}> {
  try {
    const res = await fetch("/api/ai/inline-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimOnly: true, ...(projectId ? { projectId } : {}) }),
    });
    if (res.status === 402) return { ok: false, insufficient: true };
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { remaining?: number };
    window.dispatchEvent(new Event("lifemark-free-edit-quota"));
    return { ok: true, remaining: typeof data.remaining === "number" ? data.remaining : undefined };
  } catch {
    return { ok: false };
  }
}

function changeNeedsCredit(change: VisualEditChange): boolean {
  return change.text !== undefined || change.imageSrc !== undefined;
}

export function VebEditPopover({
  selection,
  position,
  onApply,
  onClose,
  aiFallbackAvailable,
  selectionCount = 1,
  onRequestAiImage,
  onUploadImageFile,
}: {
  selection: SelectedElement;
  position: { x: number; y: number };
  onApply: (change: VisualEditChange) => void;
  onClose: () => void;
  /** Show a hint that unmatched edits are sent to the AI */
  aiFallbackAvailable?: boolean;
  selectionCount?: number;
  /** Send an AI image-gen prompt for the selected element into the composer */
  onRequestAiImage?: (prompt: string) => void;
  /** Persist an uploaded image into project files; returns a usable src (data URL or path). */
  onUploadImageFile?: (file: File) => Promise<string | null>;
}) {
  const [activeTab, setActiveTab] = useState<"text" | "colors" | "spacing" | "image">("text");
  const quota = useFreeEditQuota();
  const [editText, setEditText] = useState(selection.textContent);
  const [editClasses, setEditClasses] = useState(selection.classList.join(" "));
  const [imageUrl, setImageUrl] = useState("");
  const [aiImagePrompt, setAiImagePrompt] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageFileRef = useRef<HTMLInputElement>(null);

  // Reset edit fields when a different element is selected — React's
  // "adjust state during render" pattern (no effect → no cascading render).
  const [prevSelection, setPrevSelection] = useState(selection);
  if (prevSelection !== selection) {
    setPrevSelection(selection);
    setEditText(selection.textContent);
    setEditClasses(selection.classList.join(" "));
    setImageUrl("");
    setAiImagePrompt("");
  }

  function addClass(cls: string) {
    const updated = editClasses.includes(cls)
      ? editClasses.split(" ").filter((c) => c !== cls).join(" ")
      : (editClasses + " " + cls).trim();
    setEditClasses(updated);
    onApply({ classes: updated });
  }

  function setSpacing(kind: "m" | "p", side: "t" | "r" | "b" | "l" | "x" | "y" | "", scale: string) {
    const updated = applySpacingToken(editClasses, kind, side, scale);
    setEditClasses(updated);
    onApply({ classes: updated });
  }

  function setArbitraryColor(kind: "text" | "bg", hex: string) {
    const updated = applyArbitraryColorToken(editClasses, kind, hex);
    setEditClasses(updated);
    onApply({ classes: updated });
  }

  function setFontFamily(family: string) {
    const updated = applyFontFamilyToken(editClasses, family);
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
              {selectionCount > 1 ? ` ×${selectionCount}` : ""}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="w-6 h-6" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["text", "colors", "spacing", "image"] as const).map((tab) => (
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
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-700 dark:text-violet-300"
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
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-700 dark:text-violet-300"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      {cls.replace("font-", "")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font family */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Font</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_FONT_FAMILIES.map(({ cls, label }) => (
                    <button
                      key={cls}
                      onClick={() => setFontFamily(cls)}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${cls} ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-700 dark:text-violet-300"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      {label}
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
                <div className="flex flex-wrap items-center gap-1">
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
                  <input
                    type="color"
                    aria-label="Custom text color"
                    value={resolveDisplayHex(editClasses, "text") ?? "#000000"}
                    onChange={(e) => setArbitraryColor("text", e.target.value)}
                    className="w-7 h-7 rounded border-2 border-border bg-transparent cursor-pointer p-0.5"
                    title="Custom color"
                  />
                </div>
              </div>

              {/* Background color */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Background</label>
                <div className="flex flex-wrap items-center gap-1">
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
                  <input
                    type="color"
                    aria-label="Custom background color"
                    value={resolveDisplayHex(editClasses, "bg") ?? "#000000"}
                    onChange={(e) => setArbitraryColor("bg", e.target.value)}
                    className="w-7 h-7 rounded border-2 border-border bg-transparent cursor-pointer p-0.5"
                    title="Custom color"
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === "spacing" && (
            <div className="space-y-3">
              {(
                [
                  { label: "Margin", kind: "m" as const },
                  { label: "Padding", kind: "p" as const },
                ] as const
              ).map(({ label, kind }) => (
                <div key={kind}>
                  <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                  <div className="grid grid-cols-4 gap-1 mb-1">
                    {(
                      [
                        ["t", "Top"],
                        ["r", "Right"],
                        ["b", "Bottom"],
                        ["l", "Left"],
                      ] as const
                    ).map(([side, sideLabel]) => (
                      <div key={side} className="space-y-0.5">
                        <span className="text-[9px] text-muted-foreground block text-center">{sideLabel}</span>
                        <div className="flex flex-col gap-0.5">
                          {["0", "2", "4", "8"].map((scale) => (
                            <button
                              key={scale}
                              type="button"
                              onClick={() => setSpacing(kind, side, scale)}
                              className="text-[10px] py-0.5 rounded border border-border hover:bg-accent"
                            >
                              {scale}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {(["0", "2", "4", "6", "8"] as const).map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        onClick={() => setSpacing(kind, "", scale)}
                        className="flex-1 text-[10px] py-1 rounded border border-border hover:bg-accent"
                        title={`All sides ${kind}-${scale}`}
                      >
                        {kind}-{scale}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Raw classes</label>
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
              </div>
            </div>
          )}

          {activeTab === "image" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" /> Image URL
                </label>
                <div className="flex gap-1">
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="https://… or /assets/hero.png"
                    onKeyDown={(e) => e.key === "Enter" && imageUrl.trim() && onApply({ imageSrc: imageUrl.trim() })}
                  />
                  <Button
                    size="icon"
                    className="w-8 h-8 shrink-0"
                    disabled={!imageUrl.trim()}
                    onClick={() => onApply({ imageSrc: imageUrl.trim() })}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {onUploadImageFile && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Upload image file</label>
                  <input
                    ref={imageFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setUploadingImage(true);
                      void onUploadImageFile(file)
                        .then((src) => {
                          if (src) {
                            setImageUrl(src);
                            onApply({ imageSrc: src });
                          }
                        })
                        .finally(() => setUploadingImage(false));
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 w-full text-xs"
                    disabled={uploadingImage}
                    onClick={() => imageFileRef.current?.click()}
                  >
                    {uploadingImage ? "Uploading…" : "Choose image from disk"}
                  </Button>
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">AI image for this element</label>
                <div className="flex gap-1">
                  <Input
                    value={aiImagePrompt}
                    onChange={(e) => setAiImagePrompt(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="e.g. soft product photo on marble"
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0 text-xs"
                    disabled={!aiImagePrompt.trim() || !onRequestAiImage}
                    onClick={() => {
                      const tag = selection.tagName;
                      onRequestAiImage?.(
                        `Generate an image for the selected <${tag}> element` +
                          (selection.classList.length ? ` (classes: ${selection.classList.join(" ")})` : "") +
                          `: ${aiImagePrompt.trim()}. Replace the image src with the generated asset URL.`,
                      );
                      onClose();
                    }}
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    Send
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Sends a prompt to the composer / Image panel flow.
                </p>
              </div>
            </div>
          )}

          {(aiFallbackAvailable || quota) && (
            <div className="pt-1 border-t border-border/60 space-y-1">
              {quota && (
                <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                  <Check className="w-3 h-3 shrink-0 text-emerald-500/80" />
                  {quota.remaining > 0
                    ? `Free today: ${quota.remaining} of ${quota.limit} edits left`
                    : `Daily free edits used — further edits cost 1 credit`}
                </p>
              )}
              {aiFallbackAvailable && (
                <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  Edits that can&apos;t be matched in code are sent to the AI automatically.
                </p>
              )}
            </div>
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
  projectId?: string;
  /** Optional: route unmatched edits to the AI chat as a precise prompt */
  onRequestAiEdit?: (prompt: string) => void;
  /** When true, single-click leaf text starts inline edit (Lovable Edit text). */
  editTextMode?: boolean;
  /** Stage inline text for the pending-changes tray instead of writing files immediately. */
  onStageInlineEdit?: (selection: SelectedElement, text: string) => void;
  /** Sync multi-select to the floating toolbar selection tray. */
  onSelectionChange?: (selections: SelectedElement[]) => void;
  /** Increment to clear overlay selection from the parent toolbar. */
  clearSelectionSignal?: number;
}

async function persistVisualEditImage(
  file: File,
  onFileChange: (path: string, content: string) => void,
  projectId?: string,
): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
  if (!dataUrl.startsWith("data:image")) return null;
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `public/uploads/veb-${Date.now()}.${ext}`;
  onFileChange(path, dataUrl);
  if (projectId) {
    void fetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content: dataUrl, language: "plaintext" }),
    }).catch(() => {/* best-effort; local file already updated */});
  }
  // Prefer public URL path for Vite; data URL always works in preview.
  return dataUrl;
}

export function VisualEditOverlay({
  iframeRef,
  files,
  onFileChange,
  enabled,
  projectId,
  onRequestAiEdit,
  editTextMode = false,
  onStageInlineEdit,
  onSelectionChange,
  clearSelectionSignal = 0,
}: VisualEditOverlayProps) {
  const [selectedList, setSelectedList] = useState<SelectedElement[]>([]);
  const selected = selectedList[selectedList.length - 1] ?? null;
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const editTextModeRef = useRef(editTextMode);
  const onStageInlineEditRef = useRef(onStageInlineEdit);

  // In-place edit commit — kept in a ref so the injected dblclick handler
  // (deps: [enabled, iframeRef]) never closes over stale files/props.
  const inlineCommitRef = useRef<((sel: SelectedElement, text: string) => void) | null>(null);
  useEffect(() => {
    editTextModeRef.current = editTextMode;
    onStageInlineEditRef.current = onStageInlineEdit;
    inlineCommitRef.current = (sel, text) => {
      if (onStageInlineEditRef.current) {
        onStageInlineEditRef.current(sel, text);
        return;
      }
      applyChangeToFiles(files, sel, { text }, onFileChange, onRequestAiEdit);
    };
  }, [editTextMode, files, onFileChange, onRequestAiEdit, onStageInlineEdit]);

  useEffect(() => {
    onSelectionChange?.(selectedList);
  }, [onSelectionChange, selectedList]);

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
      .lifemark-multi { outline: 2px solid #38bdf8 !important; outline-offset: 2px; }
      .lifemark-inline-editing { outline: 2px dashed #22c55e !important; outline-offset: 2px; cursor: text !important; }
      * { transition: outline 0.1s ease; }
    `;
    doc.head.appendChild(style);

    const canInlineEdit = (el: HTMLElement) => {
      if (el.id === "lifemark-overlay" || el.isContentEditable) return false;
      const text = el.textContent ?? "";
      return !!(text.trim() && el.children.length <= 2 && text.length <= 500);
    };

    const startInlineEdit = (el: HTMLElement) => {
      const original = el.textContent ?? "";
      const snapshot: SelectedElement = {
        tagName: el.tagName.toLowerCase(),
        textContent: original,
        classList: Array.from(el.classList).filter((c) => !c.startsWith("lifemark-")),
        xpath: getXPath(el, doc),
        rect: { top: 0, left: 0, width: 0, height: 0 },
      };
      // "plaintext-only" is unsupported in Firefox (treated as invalid →
      // element stays read-only). Feature-detect and fall back to "true".
      el.setAttribute("contenteditable", "plaintext-only");
      if (!el.isContentEditable) el.setAttribute("contenteditable", "true");
      el.classList.add("lifemark-inline-editing");
      el.focus();
      const range = doc.createRange();
      range.selectNodeContents(el);
      const sel = iframe.contentWindow?.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      const commit = () => {
        cleanupEditing();
        const next = (el.textContent ?? "").trim();
        if (next && next !== original) {
          inlineCommitRef.current?.(snapshot, next);
        } else if (!next) {
          el.textContent = original;
        }
      };
      const cancel = () => {
        cleanupEditing();
        el.textContent = original;
      };
      const onKey = (ke: KeyboardEvent) => {
        if (ke.key === "Enter" && !ke.shiftKey) { ke.preventDefault(); commit(); }
        if (ke.key === "Escape") { ke.preventDefault(); cancel(); }
      };
      const cleanupEditing = () => {
        el.removeAttribute("contenteditable");
        el.classList.remove("lifemark-inline-editing");
        el.removeEventListener("blur", commit);
        el.removeEventListener("keydown", onKey);
      };
      el.addEventListener("blur", commit);
      el.addEventListener("keydown", onKey);
    };

    // Mouse events
    const handleMouseOver = (e: MouseEvent) => {
      if (!enabled) return;
      const el = e.target as HTMLElement;
      if (el.id === "lifemark-overlay") return;
      if (el.isContentEditable) return; // don't outline the element being edited
      // Clear stale outlines INSIDE THE IFRAME's document (`document` here is
      // the parent page — the hover class lives in `doc`).
      doc.querySelectorAll(".lifemark-hover").forEach((node) => node.classList.remove("lifemark-hover"));
      el.classList.add("lifemark-hover");
    };

    const handleMouseOut = (e: MouseEvent) => {
      (e.target as HTMLElement).classList.remove("lifemark-hover");
    };

    const handleClick = (e: MouseEvent) => {
      if (!enabled) return;
      const el = e.target as HTMLElement;
      // While an element is being inline-edited, clicks inside it must reach
      // the contenteditable normally (caret placement / text selection) — do
      // NOT hijack them into element selection.
      if (el.isContentEditable || el.closest("[contenteditable]")) return;
      e.preventDefault();
      e.stopPropagation();
      if (editTextModeRef.current && canInlineEdit(el)) {
        startInlineEdit(el);
        return;
      }
      const rect = el.getBoundingClientRect();
      const iframeRect = iframe.getBoundingClientRect();
      const next: SelectedElement = {
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
      };
      const additive = e.metaKey || e.ctrlKey;
      setSelectedList((prev) => {
        let list: SelectedElement[];
        if (!additive) list = [next];
        else if (prev.some((p) => p.xpath === next.xpath)) {
          list = prev.filter((p) => p.xpath !== next.xpath);
        } else {
          list = [...prev, next];
        }
        return list;
      });
      setPopoverPos({
        x: rect.left + iframeRect.left + rect.width / 2,
        y: rect.top + iframeRect.top + rect.height + 8,
      });

      if (!additive) {
        doc.querySelectorAll(".lifemark-selected, .lifemark-multi").forEach((n) => {
          n.classList.remove("lifemark-selected", "lifemark-multi");
        });
        el.classList.add("lifemark-selected");
      } else {
        el.classList.toggle("lifemark-multi");
        el.classList.add("lifemark-selected");
      }
    };

    // True in-place text editing (Lovable parity): double-click a text
    // element → edit it directly in the preview (contentEditable); Enter or
    // clicking away commits the change to source, Escape cancels.
    const handleDblClick = (e: MouseEvent) => {
      if (!enabled) return;
      const el = e.target as HTMLElement;
      if (!canInlineEdit(el)) return;
      e.preventDefault();
      e.stopPropagation();
      startInlineEdit(el);
    };

    doc.addEventListener("mouseover", handleMouseOver);
    doc.addEventListener("mouseout", handleMouseOut);
    doc.addEventListener("click", handleClick, true);
    doc.addEventListener("dblclick", handleDblClick, true);

    return () => {
      doc.removeEventListener("mouseover", handleMouseOver);
      doc.removeEventListener("mouseout", handleMouseOut);
      doc.removeEventListener("click", handleClick, true);
      doc.removeEventListener("dblclick", handleDblClick, true);
      doc.querySelectorAll(".lifemark-hover, .lifemark-selected, .lifemark-multi")
        .forEach((node) => node.classList.remove("lifemark-hover", "lifemark-selected", "lifemark-multi"));
      doc.getElementById("lifemark-overlay")?.remove();
    };
  }, [enabled, iframeRef]);

  // Selection cleanup belongs after commit. Updating state or calling parent
  // callbacks during render is replayable under concurrent React and caused
  // duplicate selection events and occasional render loops.
  useEffect(() => {
    if (!enabled) {
      setSelectedList([]);
    }
  }, [enabled]);

  useEffect(() => {
    if (clearSelectionSignal > 0) {
      setSelectedList([]);
    }
  }, [clearSelectionSignal]);

  useEffect(() => {
    if (!enabled) return;
    const cleanup = injectOverlayScript();
    return cleanup;
  }, [enabled, injectOverlayScript]);

  if (!enabled || !selected) return null;

  return (
    <>
      {selectedList.map((sel) => (
        <div
          key={sel.xpath}
          className="fixed pointer-events-none z-40 border-2 border-blue-500 rounded"
          style={{
            top: sel.rect.top,
            left: sel.rect.left,
            width: sel.rect.width,
            height: sel.rect.height,
          }}
        />
      ))}

      {selectedList.length === 1 && (
        <ResizeHandle
          sel={selected}
          onResize={(w, h) => {
            const base = ensureResizableDisplay(selected.classList.join(" "), selected.tagName);
            const updatedClasses = applyDimensionToken(applyDimensionToken(base, "w", w), "h", h);
            applyChangeToFiles(files, selected, { classes: updatedClasses }, onFileChange, onRequestAiEdit);
            setSelectedList((prev) =>
              prev.map((p) =>
                p.xpath === selected.xpath
                  ? { ...p, classList: updatedClasses.split(" ").filter(Boolean), rect: { ...p.rect, width: w, height: h } }
                  : p,
              ),
            );
          }}
        />
      )}

      <VebEditPopover
        selection={selected}
        selectionCount={selectedList.length}
        position={popoverPos}
        onClose={() => {
          setSelectedList([]);
        }}
        aiFallbackAvailable={!!onRequestAiEdit}
        onRequestAiImage={onRequestAiEdit}
        onUploadImageFile={(file) => persistVisualEditImage(file, onFileChange, projectId)}
        onApply={(change) => {
          void (async () => {
            const stagingText = change.text !== undefined && !!onStageInlineEditRef.current;
            // Staged text is billed on Send; immediate text/image persists bill now.
            if (!stagingText && changeNeedsCredit(change)) {
              const claimed = await claimVisualEditCredit(projectId);
              if (!claimed.ok) {
                toast({
                  title: claimed.insufficient ? "Out of credits" : "Couldn't apply edit",
                  description: claimed.insufficient
                    ? "Daily free edits used — add credits to save visual changes."
                    : "Try again in a moment.",
                  variant: "destructive",
                });
                return;
              }
            }
            for (const sel of selectedList) {
              if (change.text !== undefined && onStageInlineEditRef.current) {
                onStageInlineEditRef.current(
                  { ...sel, textContent: sel.textContent },
                  change.text,
                );
                // Live-update DOM for staged text
                try {
                  const iframe = iframeRef.current;
                  const doc = iframe?.contentDocument;
                  if (doc) {
                    const node = doc.evaluate(
                      sel.xpath.startsWith("//") ? sel.xpath : `//${sel.xpath}`,
                      doc,
                      null,
                      XPathResult.FIRST_ORDERED_NODE_TYPE,
                      null,
                    ).singleNodeValue as HTMLElement | null;
                    if (node) node.textContent = change.text;
                  }
                } catch {
                  /* ignore */
                }
                continue;
              }
              applyChangeToFiles(files, sel, change, onFileChange, onRequestAiEdit);
            }
            setSelectedList((prev) =>
              prev.map((p) => ({
                ...p,
                textContent: change.text !== undefined ? change.text : p.textContent,
                classList:
                  change.classes !== undefined ? change.classes.split(" ").filter(Boolean) : p.classList,
              })),
            );
          })();
        }}
      />
    </>
  );
}

// ── Bridge mode (cross-origin WebContainer engine) ────────────────────────────

interface VebBridgePopoverProps {
  selection: SelectedElement;
  /** Additional multi-selected elements (⌘/Ctrl+click). Primary `selection` is last. */
  selections?: SelectedElement[];
  files: ProjectFile[];
  onFileChange: (path: string, content: string) => void;
  projectId?: string;
  /** Send a live-apply command to the preview iframe for instant feedback */
  onLiveApply: (payload: {
    xpath: string;
    text?: string;
    classes?: string;
    imageSrc?: string;
  }) => void;
  onRequestAiEdit?: (prompt: string) => void;
  onClose: () => void;
  onSelectionChange?: (next: SelectedElement) => void;
  /** Stage text edits for the pending tray; classes/images still persist immediately. */
  onStageTextEdit?: (selection: SelectedElement, text: string) => void;
}

export function VebBridgePopover({
  selection,
  selections,
  files,
  onFileChange,
  projectId,
  onLiveApply,
  onRequestAiEdit,
  onClose,
  onSelectionChange,
  onStageTextEdit,
}: VebBridgePopoverProps) {
  const targets = selections && selections.length > 0 ? selections : [selection];
  return (
    <>
      {targets.map((sel) => (
        <div
          key={sel.xpath}
          className="fixed pointer-events-none z-40 border-2 border-blue-500 rounded"
          style={{
            top: sel.rect.top,
            left: sel.rect.left,
            width: sel.rect.width,
            height: sel.rect.height,
          }}
        />
      ))}

      {targets.length === 1 && (
        <ResizeHandle
          sel={selection}
          onResize={(w, h) => {
            const base = ensureResizableDisplay(selection.classList.join(" "), selection.tagName);
            const updatedClasses = applyDimensionToken(applyDimensionToken(base, "w", w), "h", h);
            onLiveApply({ xpath: selection.xpath, classes: updatedClasses });
            applyChangeToFiles(files, selection, { classes: updatedClasses }, onFileChange, onRequestAiEdit);
            onSelectionChange?.({ ...selection, classList: updatedClasses.split(" ").filter(Boolean) });
          }}
        />
      )}

      <VebEditPopover
        selection={selection}
        selectionCount={targets.length}
        position={{
          x: selection.rect.left + selection.rect.width / 2,
          y: selection.rect.top + selection.rect.height + 8,
        }}
        onClose={onClose}
        aiFallbackAvailable={!!onRequestAiEdit}
        onRequestAiImage={onRequestAiEdit}
        onUploadImageFile={(file) => persistVisualEditImage(file, onFileChange, projectId)}
        onApply={(change) => {
          void (async () => {
            const stagingText = change.text !== undefined && !!onStageTextEdit;
            if (!stagingText && changeNeedsCredit(change)) {
              const claimed = await claimVisualEditCredit(projectId);
              if (!claimed.ok) {
                toast({
                  title: claimed.insufficient ? "Out of credits" : "Couldn't apply edit",
                  description: claimed.insufficient
                    ? "Daily free edits used — add credits to save visual changes."
                    : "Try again in a moment.",
                  variant: "destructive",
                });
                return;
              }
            }
            for (const sel of targets) {
              onLiveApply({
                xpath: sel.xpath,
                text: change.text,
                classes: change.classes,
                imageSrc: change.imageSrc,
              });
              if (change.text !== undefined && onStageTextEdit) {
                onStageTextEdit({ ...sel, textContent: sel.textContent }, change.text);
                // Persist non-text parts of the same change immediately when present.
                if (change.classes !== undefined || change.imageSrc !== undefined) {
                  applyChangeToFiles(
                    files,
                    sel,
                    { classes: change.classes, imageSrc: change.imageSrc },
                    onFileChange,
                    onRequestAiEdit,
                  );
                }
              } else {
                applyChangeToFiles(files, sel, change, onFileChange, onRequestAiEdit);
              }
            }
            onSelectionChange?.({
              ...selection,
              textContent: change.text !== undefined ? change.text : selection.textContent,
              classList: change.classes !== undefined ? change.classes.split(" ").filter(Boolean) : selection.classList,
            });
          })();
        }}
      />
    </>
  );
}

/**
 * A single drag handle rendered at the selected element's bottom-right
 * corner. Owns its own drag lifecycle (pointer down/move/up) so neither
 * parent overlay re-renders on every pointermove — it only calls back into
 * `onResize` once, on release, with the final pixel size.
 */
function ResizeHandle({
  sel,
  onResize,
}: {
  sel: SelectedElement;
  onResize: (widthPx: number, heightPx: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const [live, setLive] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const nextSize = (e: PointerEvent) => ({
      w: Math.max(20, startRef.current.w + (e.clientX - startRef.current.x)),
      h: Math.max(20, startRef.current.h + (e.clientY - startRef.current.y)),
    });
    const onMove = (e: PointerEvent) => setLive(nextSize(e));
    const onUp = (e: PointerEvent) => {
      const { w, h } = nextSize(e);
      setDragging(false);
      setLive(null);
      onResize(w, h);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, onResize]);

  return (
    <>
      {live && (
        <div
          className="fixed pointer-events-none z-40 border-2 border-dashed border-sky-400 rounded"
          style={{ top: sel.rect.top, left: sel.rect.left, width: live.w, height: live.h }}
        />
      )}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          startRef.current = { x: e.clientX, y: e.clientY, w: sel.rect.width, h: sel.rect.height };
          setDragging(true);
        }}
        className="fixed z-50 w-3 h-3 rounded-sm bg-sky-500 border border-white shadow pointer-events-auto cursor-nwse-resize"
        style={{ top: sel.rect.top + sel.rect.height - 6, left: sel.rect.left + sel.rect.width - 6 }}
        title="Drag to resize"
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
