
/**
 * Project media gallery (Lovable parity — Jul 9 2026 "Improved image gallery
 * in the Files tab"): every image in the project in one grid, shown at real
 * proportions, with hover quick actions — Reference in chat, Copy URL,
 * Download, and Delete (project files only).
 *
 * Sources:
 *   1. Project files with image extensions (.svg rendered inline sanitized;
 *      data-URL / base64 content rendered directly)
 *   2. Image URLs referenced anywhere in the project's code (https…png/jpg/
 *      webp/gif/avif/svg + images.unsplash.com)
 */

import { useMemo, useState } from "react";
import { Image as ImageIcon, Trash2, Download, Copy, Check, MessageSquare, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sanitizeSvg } from "@/lib/security/sanitize";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { ProjectFile } from "@/types/database";

interface MediaGalleryPanelProps {
  files: ProjectFile[];
  onSendToChat?: (prompt: string) => void;
  onFilesUpdate?: (files: ProjectFile[]) => void;
}

interface MediaItem {
  key: string;
  label: string;
  /** Renderable src (data URL or remote URL); null → svg inline render */
  src: string | null;
  svgMarkup?: string;
  /** Set for project files (enables Delete) */
  fileId?: string;
  filePath?: string;
  /** Where a referenced URL was found */
  referencedIn?: string;
}

const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|avif|ico|bmp)$/i;
const SVG_EXT_RE = /\.svg$/i;
const URL_RE = /https?:\/\/[^\s"'`)\]}>]+?\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?[^\s"'`)\]}>]*)?/gi;
const UNSPLASH_RE = /https?:\/\/images\.unsplash\.com\/[^\s"'`)\]}>]+/gi;

function collectMedia(files: ProjectFile[]): MediaItem[] {
  const items: MediaItem[] = [];
  const seen = new Set<string>();

  for (const f of files) {
    if (SVG_EXT_RE.test(f.path) && f.content?.trimStart().startsWith("<")) {
      items.push({ key: `file:${f.path}`, label: f.path, src: null, svgMarkup: f.content, fileId: f.id, filePath: f.path });
      continue;
    }
    if (IMG_EXT_RE.test(f.path)) {
      const c = f.content ?? "";
      const src = c.startsWith("data:image")
        ? c
        : /^[A-Za-z0-9+/=\r\n]+$/.test(c.slice(0, 200)) && c.length > 100
          ? `data:image/${(f.path.split(".").pop() ?? "png").replace("jpg", "jpeg")};base64,${c.replace(/\s/g, "")}`
          : null;
      items.push({ key: `file:${f.path}`, label: f.path, src, fileId: f.id, filePath: f.path });
    }
  }

  // Referenced image URLs across code (skip lockfiles / envs)
  for (const f of files) {
    if (/package-lock|\.env|\.lock/.test(f.path) || !f.content) continue;
    for (const re of [URL_RE, UNSPLASH_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(f.content)) !== null && items.length < 200) {
        const url = m[0];
        if (seen.has(url)) continue;
        seen.add(url);
        items.push({ key: `url:${url}`, label: url.split("/").pop()?.split("?")[0] ?? url, src: url, referencedIn: f.path });
      }
    }
  }
  return items;
}

export function MediaGalleryPanel({ files, onSendToChat, onFilesUpdate }: MediaGalleryPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [brokenKeys, setBrokenKeys] = useState<Set<string>>(new Set());
  const confirm = useConfirm();
  const items = useMemo(() => collectMedia(files), [files]);

  function copyUrl(item: MediaItem) {
    const value = item.src ?? item.svgMarkup ?? "";
    navigator.clipboard.writeText(value).then(() => {
      setCopiedKey(item.key);
      setTimeout(() => setCopiedKey(null), 1500);
    }).catch(() => {});
  }

  function download(item: MediaItem) {
    const a = document.createElement("a");
    if (item.svgMarkup) {
      const blob = new Blob([item.svgMarkup], { type: "image/svg+xml" });
      a.href = URL.createObjectURL(blob);
      a.download = item.label.split("/").pop() ?? "image.svg";
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    if (!item.src) return;
    a.href = item.src;
    a.download = item.label.split("/").pop() ?? "image";
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  }

  function reference(item: MediaItem) {
    const ref = item.filePath ?? item.src ?? "";
    onSendToChat?.(`Use this image: ${ref}\n\n`);
  }

  async function deleteFile(item: MediaItem) {
    if (!item.fileId || !item.filePath) return;
    const ok = await confirm({
      title: "Delete image?",
      description: `${item.filePath} will be removed from the project. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("project_files").delete().eq("id", item.fileId);
      if (error) throw error;
      onFilesUpdate?.(files.filter((f) => f.id !== item.fileId));
      toast({ title: "Image deleted", description: item.filePath });
    } catch {
      toast({ title: "Couldn't delete the image", variant: "destructive" });
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
        <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">No media yet</p>
        <p className="text-xs text-muted-foreground">
          Images in your project files — and image URLs referenced in your code — will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <p className="text-[11px] text-muted-foreground mb-2">
        {items.length} image{items.length === 1 ? "" : "s"} — project files and URLs referenced in code
      </p>
      {/* CSS columns keep each image at its real proportions (Lovable Jul 9) */}
      <div className="columns-2 gap-2 [column-fill:_balance]">
        {items.map((item) => (
          <div
            key={item.key}
            className="group relative mb-2 break-inside-avoid rounded-lg overflow-hidden border border-border/50 bg-muted/20"
          >
            {item.svgMarkup ? (
              <div
                className="w-full [&>svg]:w-full [&>svg]:h-auto bg-[repeating-conic-gradient(#26263733_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-2"
                dangerouslySetInnerHTML={{ __html: sanitizeSvg(item.svgMarkup) }}
              />
            ) : item.src && !brokenKeys.has(item.key) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.src}
                alt={item.label}
                loading="lazy"
                className="w-full h-auto block"
                onError={() => setBrokenKeys((prev) => new Set(prev).add(item.key))}
              />
            ) : (
              <div className="flex items-center justify-center h-20 text-muted-foreground/40">
                <ImageIcon className="w-6 h-6" />
              </div>
            )}

            {/* Hover overlay: name + quick actions */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-2">
              <p className="text-[10px] text-white/90 font-mono truncate mb-1.5" title={item.referencedIn ? `Referenced in ${item.referencedIn}` : item.label}>
                {item.label}
              </p>
              <div className="flex items-center gap-1">
                {onSendToChat && (
                  <button
                    onClick={() => reference(item)}
                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/25 text-white transition-colors"
                    title="Reference in chat"
                  >
                    <MessageSquare className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => copyUrl(item)}
                  className="p-1.5 rounded-md bg-white/10 hover:bg-white/25 text-white transition-colors"
                  title={item.src?.startsWith("http") ? "Copy URL" : "Copy source"}
                >
                  {copiedKey === item.key ? <Check className="w-3 h-3 text-green-400" /> : item.src?.startsWith("http") ? <Link2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => download(item)}
                  className="p-1.5 rounded-md bg-white/10 hover:bg-white/25 text-white transition-colors"
                  title="Download"
                >
                  <Download className="w-3 h-3" />
                </button>
                {item.fileId && (
                  <button
                    onClick={() => void deleteFile(item)}
                    className="p-1.5 rounded-md bg-white/10 hover:bg-red-500/60 text-white transition-colors ml-auto"
                    title="Delete from project"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
