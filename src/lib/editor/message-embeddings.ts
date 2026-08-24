/**
 * Persist + reuse chat message embeddings for semantic search.
 * Embeddings are stored as JSONB float arrays; the `model` column records
 * which embedding source actually produced each row (OpenAI vs. the local
 * Python service — see src/lib/ai/embed-text.ts), since embed-text.ts can
 * fall back between sources per-call depending on config. A cached row
 * whose model doesn't match the model embedTexts() would use right now is
 * treated as stale and re-embedded — this is what keeps mixed-dimension
 * vectors out of the table in the first place (cosineSimilarity in
 * search-chat-messages.ts is the second, independent guard against them).
 */
import { createHash } from "crypto";
import { embedTexts, getExpectedEmbedModel } from "../ai/embed-text.ts";

export const MESSAGE_EMBED_EXCERPT_LEN = 800;

export function messageEmbedExcerpt(content: string): string {
  return (content ?? "").slice(0, MESSAGE_EMBED_EXCERPT_LEN);
}

export function hashEmbedContent(excerpt: string): string {
  return createHash("sha256").update(excerpt).digest("hex").slice(0, 32);
}

type EmbedRow = {
  message_id: string;
  content_hash: string;
  model: string | null;
  embedding: number[] | unknown;
};

function asVector(raw: unknown): number[] | null {
  if (Array.isArray(raw) && raw.every((n) => typeof n === "number")) {
    return raw as number[];
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return asVector(parsed);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Load cached vectors for messages; embed + upsert any that are missing,
 * content-stale, or from a different embedding model than embedTexts()
 * would use right now. Returns a Map messageId → vector (only for messages
 * that have a usable, current-model vector).
 */
export async function getOrCreateMessageEmbeddings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  messages: Array<{ id: string; content: string }>,
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (!messages.length) return out;

  const ids = messages.map((m) => m.id);
  const { data: cached } = await supabase
    .from("message_embeddings")
    .select("message_id, content_hash, model, embedding")
    .eq("project_id", projectId)
    .in("message_id", ids);

  const byId = new Map<string, EmbedRow>(
    ((cached ?? []) as EmbedRow[]).map((r) => [r.message_id, r]),
  );

  // Cheap, no-network check of which model embedTexts() would use right
  // now, so a cached row from a since-retired model gets treated as stale
  // rather than reused. See getExpectedEmbedModel()'s doc comment for why
  // this is a best-effort hint, not the correctness guarantee — that's
  // cosineSimilarity's dimension check in search-chat-messages.ts.
  const activeModel = getExpectedEmbedModel();

  const needEmbed: Array<{ id: string; excerpt: string; hash: string }> = [];
  for (const m of messages) {
    const excerpt = messageEmbedExcerpt(m.content);
    if (!excerpt.trim()) continue;
    const hash = hashEmbedContent(excerpt);
    const row = byId.get(m.id);
    const vec = row ? asVector(row.embedding) : null;
    const modelMatches = !activeModel || !row?.model || row.model === activeModel;
    if (row && row.content_hash === hash && vec && modelMatches) {
      out.set(m.id, vec);
    } else {
      needEmbed.push({ id: m.id, excerpt, hash });
    }
  }

  if (!needEmbed.length) return out;

  // Batch to keep provider payload reasonable
  const BATCH = 64;
  for (let i = 0; i < needEmbed.length; i += BATCH) {
    const batch = needEmbed.slice(i, i + BATCH);
    const result = await embedTexts(batch.map((b) => b.excerpt));
    if (!result || result.vectors.length !== batch.length) continue;

    const upserts = batch.map((b, idx) => ({
      message_id: b.id,
      project_id: projectId,
      content_hash: b.hash,
      model: result.model,
      embedding: result.vectors[idx]!,
      updated_at: new Date().toISOString(),
    }));

    await supabase.from("message_embeddings").upsert(upserts, {
      onConflict: "message_id",
    });

    batch.forEach((b, idx) => out.set(b.id, result.vectors[idx]!));
  }

  return out;
}

/** Embed a single message after insert/update (fire-and-forget safe). */
export async function upsertMessageEmbedding(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  messageId: string,
  content: string,
): Promise<void> {
  const excerpt = messageEmbedExcerpt(content);
  if (!excerpt.trim()) return;
  const result = await embedTexts([excerpt]);
  if (!result?.vectors[0]) return;
  await supabase.from("message_embeddings").upsert(
    {
      message_id: messageId,
      project_id: projectId,
      content_hash: hashEmbedContent(excerpt),
      model: result.model,
      embedding: result.vectors[0],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "message_id" },
  );
}
