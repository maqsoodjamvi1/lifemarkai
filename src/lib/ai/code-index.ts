/**
 * Incremental per-project code index (Cursor-style, adapted).
 *
 * What Cursor taught the field: chunk along the AST, hash files, and make
 * indexing cost proportional to WHAT CHANGED, not repo size. This module is
 * that loop for LifemarkAI projects:
 *
 *   sync:   file_hash comparison → only changed files re-chunk + re-embed;
 *           deleted files drop their rows.
 *   search: embed the query once, cosine-rank the project's chunks
 *           in-process (a project is a few hundred chunks — the same
 *           JSONB + in-process pattern message-embeddings.ts already uses,
 *           deliberately NOT a second vector-store dependency).
 *
 * Model changes are handled the same way message-embeddings handles them:
 * every row records the model that produced it; rows from a retired model
 * count as stale and re-embed on the next sync touching their file, and
 * search skips rows whose model doesn't match the query's (dimension guard
 * in cosineSimilarity is the final backstop).
 */
import { createHash } from "crypto";
import { chunkSourceFile, isIndexablePath } from "../editor/code-chunker.ts";
import { cosineSimilarity } from "../editor/search-chat-messages.ts";
import { embedTexts } from "./embed-text.ts";

export function fileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

const EXCERPT_LEN = 240;
/** Bound per-sync work so an agent tool call can't stall on a huge project. */
const MAX_FILES_PER_SYNC = 40;
const EMBED_BATCH = 64;

export interface SyncStats {
  scanned: number;
  changed: number;
  indexed: number;
  removed: number;
  /** Files that still need indexing (deferred past the per-sync cap) */
  pending: number;
}

interface ChunkRowLite {
  path: string;
  file_hash: string;
}

/**
 * Bring the index up to date with `files` (the project's CURRENT contents,
 * including unsaved agent edits). Incremental: touches only files whose
 * hash changed. Safe to call on every code_search — the no-change case is
 * one SELECT.
 */
export async function ensureProjectCodeIndex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  files: Array<{ path: string; content: string }>,
): Promise<SyncStats> {
  const indexable = files.filter((f) => isIndexablePath(f.path));
  const currentHashes = new Map(indexable.map((f) => [f.path, fileHash(f.content)]));

  const { data: existing } = await supabase
    .from("project_code_chunks")
    .select("path, file_hash")
    .eq("project_id", projectId);

  const storedByPath = new Map<string, string>();
  for (const row of (existing ?? []) as ChunkRowLite[]) {
    storedByPath.set(row.path, row.file_hash);
  }

  const changed = indexable.filter((f) => storedByPath.get(f.path) !== currentHashes.get(f.path));
  const removedPaths = [...storedByPath.keys()].filter((p) => !currentHashes.has(p));

  const stats: SyncStats = {
    scanned: indexable.length,
    changed: changed.length,
    indexed: 0,
    removed: removedPaths.length,
    pending: Math.max(0, changed.length - MAX_FILES_PER_SYNC),
  };

  if (removedPaths.length) {
    await supabase
      .from("project_code_chunks")
      .delete()
      .eq("project_id", projectId)
      .in("path", removedPaths);
  }

  const batchFiles = changed.slice(0, MAX_FILES_PER_SYNC);
  type PendingChunk = {
    file: { path: string; content: string };
    hash: string;
    chunk: ReturnType<typeof chunkSourceFile>[number];
  };
  const pendingChunks: PendingChunk[] = [];
  for (const f of batchFiles) {
    for (const chunk of chunkSourceFile(f.path, f.content)) {
      pendingChunks.push({ file: f, hash: currentHashes.get(f.path)!, chunk });
    }
  }
  if (!pendingChunks.length) return stats;

  for (let i = 0; i < pendingChunks.length; i += EMBED_BATCH) {
    const batch = pendingChunks.slice(i, i + EMBED_BATCH);
    // Path + name in the embedded text helps retrieval ("auth route" should
    // pull src/routes/api/auth even when the code never says "auth route").
    const result = await embedTexts(
      batch.map(
        (p) => `${p.file.path} ${p.chunk.name}\n${p.chunk.text}`.slice(0, 6000),
      ),
    );
    if (!result || result.vectors.length !== batch.length) {
      // Embedding source down — leave those files unindexed (their hash rows
      // aren't written, so the next sync retries them).
      stats.pending += new Set(batch.map((b) => b.file.path)).size;
      continue;
    }

    // Replace rows per file exactly once (files may span embed batches, so
    // only delete when this batch holds the file's chunkIndex 0).
    const firstOfFile = new Set(
      batch.filter((b) => b.chunk.chunkIndex === 0).map((b) => b.file.path),
    );
    if (firstOfFile.size) {
      await supabase
        .from("project_code_chunks")
        .delete()
        .eq("project_id", projectId)
        .in("path", [...firstOfFile]);
    }

    const rows = batch.map((b, idx) => ({
      project_id: projectId,
      path: b.file.path,
      chunk_index: b.chunk.chunkIndex,
      start_line: b.chunk.startLine,
      end_line: b.chunk.endLine,
      kind: b.chunk.kind,
      name: b.chunk.name,
      file_hash: b.hash,
      content_hash: fileHash(b.chunk.text),
      model: result.model,
      embedding: result.vectors[idx]!,
      content_excerpt: b.chunk.text.slice(0, EXCERPT_LEN),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("project_code_chunks").insert(rows);
    if (!error) stats.indexed += new Set(batch.map((b) => b.file.path)).size;
  }

  return stats;
}

export interface CodeSearchHit {
  path: string;
  startLine: number;
  endLine: number;
  name: string;
  score: number;
  excerpt: string;
}

/** Semantic search over the project's indexed chunks. */
export async function searchProjectCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  query: string,
  k = 8,
): Promise<CodeSearchHit[] | null> {
  const embedded = await embedTexts([query.slice(0, 1000)]);
  const queryVec = embedded?.vectors[0];
  if (!queryVec) return null;

  const { data: rows } = await supabase
    .from("project_code_chunks")
    .select("path, start_line, end_line, name, model, embedding, content_excerpt")
    .eq("project_id", projectId)
    .limit(3000);
  if (!rows?.length) return [];

  const hits: CodeSearchHit[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.model !== embedded!.model) continue; // stale-model rows are invisible
    const vec = Array.isArray(row.embedding) ? (row.embedding as number[]) : null;
    if (!vec) continue;
    const score = cosineSimilarity(queryVec, vec);
    if (score === null || score < 0.2) continue;
    hits.push({
      path: String(row.path),
      startLine: Number(row.start_line),
      endLine: Number(row.end_line),
      name: String(row.name ?? ""),
      score,
      excerpt: String(row.content_excerpt ?? ""),
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

/** Render sync + search output for the agent. */
export function formatCodeSearch(
  stats: SyncStats,
  hits: CodeSearchHit[] | null,
  query: string,
): string {
  const syncNote =
    stats.changed > 0
      ? `(index refreshed: ${stats.indexed} file(s) re-embedded${stats.pending ? `, ${stats.pending} deferred to next call` : ""})\n`
      : "";
  if (hits === null) {
    return `${syncNote}code_search unavailable: no embedding source configured (need OPENAI_API_KEY or INTELLIGENCE_SERVICE_URL). Use search_code (text) instead.`;
  }
  if (!hits.length) {
    return `${syncNote}No semantically similar code found for: "${query}". Try search_code for exact text.`;
  }
  const lines = hits.map(
    (h) =>
      `${h.path}:${h.startLine}-${h.endLine}${h.name ? ` (${h.name})` : ""} score=${h.score.toFixed(2)}\n  ${h.excerpt.split("\n").slice(0, 3).join("\n  ")}`,
  );
  return `${syncNote}Top ${hits.length} match(es) for "${query}":\n${lines.join("\n")}`;
}
