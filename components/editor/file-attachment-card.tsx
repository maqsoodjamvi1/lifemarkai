"use client";

/**
 * FileAttachmentCard — renders a generated file from /api/ai/analyze (or any
 * other endpoint that produces { name, base64, sizeBytes, mimeType }) as a
 * Lovable-style attachment chip in the chat transcript.
 *
 * Features:
 *   • MIME-type icon (PDF / spreadsheet / doc / image / generic)
 *   • Filename + human-readable size
 *   • Download button (base64 → data URL → anchor click)
 *   • Optional "Save to project" button — calls the supplied callback so the
 *     parent (chat-panel) can persist it under project_files.
 *
 * Designed to be embedded inside an assistant message bubble without any
 * extra wrapper.
 */

import { useMemo, useState } from "react";
import {
  Download,
  FileText,
  FileSpreadsheet,
  Presentation,
  Image as ImageIcon,
  FileCode2,
  FilePlus2,
  Save,
  Check,
  Loader2,
} from "lucide-react";

export interface GeneratedFile {
  name: string;
  /** base64-encoded body; empty string is allowed for files too large to inline */
  base64: string;
  sizeBytes: number;
  mimeType: string;
}

interface FileAttachmentCardProps {
  file: GeneratedFile;
  /** Optional save handler; if omitted, the Save button is hidden. */
  onSaveToProject?: (file: GeneratedFile) => Promise<void> | void;
}

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.includes("pdf")) return FileText;
  if (mime.includes("spreadsheet") || mime.includes("csv") || mime.endsWith("/xlsx")) return FileSpreadsheet;
  if (mime.includes("presentation")) return Presentation;
  if (mime.includes("wordprocessing") || mime.includes("msword")) return FileText;
  if (mime.startsWith("text/") || mime.includes("json")) return FileCode2;
  return FilePlus2;
}

function humanSize(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileAttachmentCard({ file, onSaveToProject }: FileAttachmentCardProps) {
  const Icon = useMemo(() => iconFor(file.mimeType), [file.mimeType]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleDownload() {
    if (!file.base64) return;
    const href = `data:${file.mimeType};base64,${file.base64}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleSave() {
    if (!onSaveToProject || saving) return;
    setSaving(true);
    try {
      await onSaveToProject(file);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const isImage = file.mimeType.startsWith("image/") && file.base64;

  return (
    <div className="flex items-stretch gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 max-w-full">
      {/* Thumbnail / icon */}
      <div className="w-12 h-12 rounded-lg bg-background border border-border/60 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:${file.mimeType};base64,${file.base64}`}
            alt={file.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Icon className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      {/* Filename + size */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <p className="text-xs font-medium text-foreground truncate" title={file.name}>
          {file.name}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {humanSize(file.sizeBytes)}{file.mimeType ? ` · ${file.mimeType.split("/").pop()}` : ""}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={handleDownload}
          disabled={!file.base64}
          className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={file.base64 ? "Download" : "File too large to inline — re-generate to capture content"}
        >
          <Download className="w-3 h-3" />
          Download
        </button>

        {onSaveToProject && (
          <button
            onClick={handleSave}
            disabled={saving || !file.base64}
            className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Save into this project's files"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : saved ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Save className="w-3 h-3" />
            )}
            {saved ? "Saved" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Convenience wrapper that renders a list of files with consistent spacing
 * and a header. Use when /api/ai/analyze returns multiple outputs.
 */
export function FileAttachmentList({
  files,
  onSaveToProject,
  caption,
}: {
  files: GeneratedFile[];
  onSaveToProject?: (file: GeneratedFile) => Promise<void> | void;
  caption?: string;
}) {
  if (!files?.length) return null;
  return (
    <div className="space-y-2">
      {caption && (
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
          {caption}
        </p>
      )}
      <div className="space-y-1.5">
        {files.map((f) => (
          <FileAttachmentCard key={f.name} file={f} onSaveToProject={onSaveToProject} />
        ))}
      </div>
    </div>
  );
}
