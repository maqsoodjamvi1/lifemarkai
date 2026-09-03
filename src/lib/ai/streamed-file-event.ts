import type { ParsedFileUpdate } from "./xml-stream-parser.ts";

/** Skip live-preview apply for huge files; the final commit still persists them. */
export const LIVE_STREAM_CONTENT_MAX = 400_000;

/**
 * JSON builds emit `{ streamedFile, content, language }` when a file closes.
 * Convert that SSE event into the same update shape XML `<file_update>` uses
 * so the preview file-sync path can apply it without writing project_files.
 */
export function streamedFileEventToUpdate(
  event: Record<string, unknown>,
): ParsedFileUpdate | null {
  const path = typeof event.streamedFile === "string" ? event.streamedFile.trim() : "";
  if (!path) return null;
  const content = typeof event.content === "string" ? event.content : null;
  if (content == null || content.length > LIVE_STREAM_CONTENT_MAX) return null;
  const language = typeof event.language === "string" ? event.language : undefined;
  return { path, kind: "full", content, language };
}
