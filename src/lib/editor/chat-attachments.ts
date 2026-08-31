/**
 * Pure helpers for chat-panel.tsx's multi-file attachment tray
 * (attachedFiles — up to MAX_ATTACHED_FILES documents/code files per
 * message, Lovable parity; was a single `attachedText` slot before).
 *
 * Pulled out of the 6000+ line chat-panel.tsx component so this logic has
 * direct unit test coverage instead of only being exercised by clicking
 * through the composer in a real browser — not something this environment
 * can do. chat-panel.tsx itself has no unit tests of its own (it's wired
 * end-to-end to streaming, routing, and a dozen other subsystems), so this
 * module is deliberately where the actual risk in this change — merge
 * correctness and the attachment cap — gets verified mechanically.
 */

export interface ChatAttachedFile {
  name: string;
  content: string;
}

export const MAX_ATTACHED_FILES = 10;

/**
 * Every existing single-slot consumer of the old `attachedText` state
 * (the prompt queue's wire shape, chat-state persistence, the AI send
 * payload) still expects `{ name, content } | null`, not an array — so
 * this merges the tray back into that same shape rather than requiring
 * every downstream call site to learn a new format. 0 files -> null,
 * exactly matching old "nothing attached" behavior. 1 file -> returned
 * as-is, so the single-attachment case (still the common one) is
 * byte-identical to the pre-array behavior. 2+ files -> one synthetic
 * document with a clear "--- name ---" header per file, so the AI can
 * still tell the files apart inside the merged text.
 */
export function combineAttachedFiles(files: ChatAttachedFile[]): ChatAttachedFile | null {
  if (files.length === 0) return null;
  if (files.length === 1) return files[0];
  return {
    name: `${files.length} files`,
    content: files.map((f) => `--- ${f.name} ---\n${f.content}`).join("\n\n"),
  };
}

/**
 * Appends a file to the tray unless it's already at MAX_ATTACHED_FILES, in
 * which case the tray is returned unchanged so the caller can tell the
 * attempt was rejected (by comparing the returned array's length to the
 * input's) and surface that to the user.
 *
 * Re-attaching the same filename (drag it in twice, or re-pick it from the
 * file dialog) replaces the existing entry in place rather than appending a
 * duplicate — without this, combineAttachedFiles would send the AI the same
 * file's contents twice under two "--- name ---" headers, and the composer
 * would show two identical, indistinguishable chips.
 */
export function appendAttachedFile(
  files: ChatAttachedFile[],
  file: ChatAttachedFile,
  max: number = MAX_ATTACHED_FILES,
): ChatAttachedFile[] {
  const existingIndex = files.findIndex((f) => f.name === file.name);
  if (existingIndex !== -1) {
    const next = [...files];
    next[existingIndex] = file;
    return next;
  }
  if (files.length >= max) return files;
  return [...files, file];
}
