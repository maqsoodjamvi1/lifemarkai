import type { ProjectFile } from "../../types/database.ts";

/** FNV-1a 32-bit — fast, good enough to catch middle-of-file surgical edits. */
function hashContent(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Stable signature for preview remounts when file contents change.
 *
 * Must fingerprint the FULL content — length + first-N-chars used to collide
 * on typical menu/nav find-replace edits (same imports header, same length),
 * so the srcdoc iframe never remounted and the preview looked frozen.
 */
export function filesContentSignature(files: Pick<ProjectFile, "path" | "content">[]): string {
  return [...files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => {
      const content = f.content ?? "";
      return `${f.path}:${content.length}:${hashContent(content)}`;
    })
    .join("\n");
}
