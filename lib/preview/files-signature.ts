import type { ProjectFile } from "@/types/database";

/** Stable signature for preview remounts when file contents change. */
export function filesContentSignature(files: Pick<ProjectFile, "path" | "content">[]): string {
  return files
    .map((f) => `${f.path}:${(f.content ?? "").length}:${(f.content ?? "").slice(0, 48)}`)
    .join("\n");
}
