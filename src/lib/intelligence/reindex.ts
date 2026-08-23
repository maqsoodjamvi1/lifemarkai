/**
 * Fire-and-forget workspace re-index into the Rust AST service after
 * project_files writes. Never throws; never blocks the editor hot path.
 */
import { indexFiles } from "./polyglot-bridge.ts";

export type IndexableFile = {
  path: string;
  content: string;
  language?: string;
};

/** Index a single file change (upsert/patch). */
export function scheduleReindexFile(file: IndexableFile): void {
  if (!process.env.LIFEMARK_RUST_AST_URL) return;
  void indexFiles([file]).catch(() => {
    /* offline / timeout — orchestrator will re-index on next initiative */
  });
}

/** Index a batch (e.g. agent multi-file write). */
export function scheduleReindexFiles(files: IndexableFile[]): void {
  if (!process.env.LIFEMARK_RUST_AST_URL || files.length === 0) return;
  void indexFiles(files).catch(() => {});
}
