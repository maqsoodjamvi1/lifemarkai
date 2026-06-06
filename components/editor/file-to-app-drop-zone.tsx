"use client";

/**
 * FileToAppDropZone
 *
 * A full-editor drag-and-drop overlay. When the user drags any file over the
 * editor it shows a drop target. On drop it reads the file, builds a
 * tailored "build me an app from this" prompt, and calls `onPromptReady`.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, FileSpreadsheet, Image, Code2, Database, FileJson, FileType } from "lucide-react";

interface FileToAppDropZoneProps {
  /** Called with the assembled prompt (and optional base64 image) */
  onPromptReady: (prompt: string, imageBase64?: string) => void;
  /** Whether the editor is currently busy generating */
  disabled?: boolean;
}

type FileKind = "csv" | "json" | "image" | "pdf" | "code" | "text" | "unknown";

function classifyFile(file: File): FileKind {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type;
  if (mime.startsWith("image/")) return "image";
  if (ext === "csv" || mime === "text/csv") return "csv";
  if (ext === "json" || mime === "application/json") return "json";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["js","ts","jsx","tsx","py","rb","go","rs","java","cpp","c","html","css","sql"].includes(ext)) return "code";
  if (["txt","md","mdx"].includes(ext) || mime.startsWith("text/")) return "text";
  return "unknown";
}

const KIND_META: Record<FileKind, { icon: React.ElementType; color: string; label: string }> = {
  csv:     { icon: FileSpreadsheet, color: "text-emerald-400", label: "Spreadsheet / CSV" },
  json:    { icon: FileJson,        color: "text-blue-400",    label: "JSON Data" },
  image:   { icon: Image,           color: "text-pink-400",    label: "Design / Image" },
  pdf:     { icon: FileType,        color: "text-orange-400",  label: "PDF Document" },
  code:    { icon: Code2,           color: "text-violet-400",  label: "Source Code" },
  text:    { icon: FileText,        color: "text-yellow-400",  label: "Text / Markdown" },
  unknown: { icon: Upload,          color: "text-muted-foreground", label: "File" },
};

async function buildPrompt(file: File): Promise<{ prompt: string; imageBase64?: string }> {
  const kind = classifyFile(file);

  if (kind === "image") {
    const imageBase64 = await readAsDataURL(file);
    const prompt = `I've attached an image of a design/UI/concept. Build a pixel-perfect React web app that matches this design. Use Tailwind CSS for styling and make it fully interactive.`;
    return { prompt, imageBase64 };
  }

  if (kind === "csv") {
    const text = await readAsText(file, 8000);
    const lines = text.split("\n").slice(0, 6).join("\n");
    return {
      prompt: `Here is a CSV file named "${file.name}":\n\`\`\`csv\n${lines}\n...\n\`\`\`\n\nBuild a beautiful data dashboard web app for this CSV. Include:\n- A data table with sorting and filtering\n- At least 2 charts (bar, line, or pie) that summarise the key columns\n- A summary stats row at the top\n- Tailwind CSS styling with a clean, modern look`,
    };
  }

  if (kind === "json") {
    const text = await readAsText(file, 6000);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    const preview = JSON.stringify(parsed, null, 2).slice(0, 1200);
    return {
      prompt: `Here is a JSON file named "${file.name}":\n\`\`\`json\n${preview}\n...\n\`\`\`\n\nBuild an interactive React web app to display and explore this data. If it's an array, show a searchable/filterable table. If it's a config/object, show a well-formatted editor or viewer. Use Tailwind CSS.`,
    };
  }

  if (kind === "pdf") {
    // We can't parse PDF binary easily client-side without a lib, so just name it
    return {
      prompt: `I have a PDF document named "${file.name}". Build a web app that could serve as a companion tool or viewer for this type of document. Infer the content type from the filename and create an appropriate interactive experience with Tailwind CSS.`,
    };
  }

  if (kind === "code") {
    const text = await readAsText(file, 8000);
    const ext = file.name.split(".").pop() ?? "";
    return {
      prompt: `Here is a ${ext.toUpperCase()} file named "${file.name}":\n\`\`\`${ext}\n${text.slice(0, 4000)}\n\`\`\`\n\nBuild a React web app that visualises, documents, or provides a useful interface for this code. For example: a live playground, a component showcase, an API explorer, or an interactive demo.`,
    };
  }

  if (kind === "text") {
    const text = await readAsText(file, 6000);
    const ext = file.name.split(".").pop() ?? "txt";
    return {
      prompt: `Here is a ${ext.toUpperCase()} file named "${file.name}":\n\`\`\`\n${text.slice(0, 3000)}\n\`\`\`\n\nBuild a React web app that presents this content beautifully. Consider making it a rich reading experience, a searchable reference, or an interactive guide depending on the content type.`,
    };
  }

  return {
    prompt: `I've dropped a file named "${file.name}" (${file.type || "unknown type"}). Build a React web app that would be useful for working with this type of file. Use Tailwind CSS and make it polished and interactive.`,
  };
}

function readAsText(file: File, maxBytes = 20000): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).slice(0, maxBytes));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function FileToAppDropZone({ onPromptReady, disabled }: FileToAppDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [hoveredKind, setHoveredKind] = useState<FileKind | null>(null);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1 && !disabled) {
      const items = Array.from(e.dataTransfer?.items ?? []);
      const file = items.find((i) => i.kind === "file");
      if (file) {
        const ext = file.type;
        setHoveredKind(
          ext.startsWith("image/") ? "image" :
          ext === "text/csv" ? "csv" :
          ext === "application/json" ? "json" :
          ext === "application/pdf" ? "pdf" :
          ext.startsWith("text/") ? "text" : "unknown"
        );
        setDragging(true);
      }
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragging(false);
      setHoveredKind(null);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    setHoveredKind(null);
    if (disabled) return;

    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    const file = files[0];

    setProcessing(true);
    try {
      const { prompt, imageBase64 } = await buildPrompt(file);
      onPromptReady(prompt, imageBase64);
    } finally {
      setProcessing(false);
    }
  }, [disabled, onPromptReady]);

  useEffect(() => {
    const el = document.body;
    el.addEventListener("dragenter", handleDragEnter);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("drop", handleDrop as unknown as EventListener);
    return () => {
      el.removeEventListener("dragenter", handleDragEnter);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("drop", handleDrop as unknown as EventListener);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  const kind = hoveredKind ?? "unknown";
  const meta = KIND_META[kind];
  const Icon = meta.icon;

  return (
    <AnimatePresence>
      {(dragging || processing) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

          {/* Drop card */}
          <motion.div
            initial={{ scale: 0.92, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 8 }}
            className="relative flex flex-col items-center gap-4 p-10 rounded-2xl border-2 border-dashed border-violet-500/60 bg-card shadow-2xl shadow-violet-500/10 min-w-[320px]"
          >
            {processing ? (
              <>
                <div className="w-14 h-14 rounded-full bg-violet-500/10 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-7 h-7 border-2 border-violet-400 border-t-transparent rounded-full"
                  />
                </div>
                <p className="text-sm font-medium text-foreground">Reading file…</p>
              </>
            ) : (
              <>
                <div className={`w-14 h-14 rounded-full bg-muted flex items-center justify-center ${meta.color}`}>
                  <Icon className="w-7 h-7" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-base font-semibold text-foreground">Drop to build an app</p>
                  <p className="text-sm text-muted-foreground">{meta.label} detected</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                  <span className="px-2 py-0.5 rounded bg-muted">CSV</span>
                  <span className="px-2 py-0.5 rounded bg-muted">JSON</span>
                  <span className="px-2 py-0.5 rounded bg-muted">Image</span>
                  <span className="px-2 py-0.5 rounded bg-muted">PDF</span>
                  <span className="px-2 py-0.5 rounded bg-muted">Code</span>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
