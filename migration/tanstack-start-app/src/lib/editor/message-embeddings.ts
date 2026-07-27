/**
 * Persist + reuse chat message embeddings for semantic search.
 * Embeddings are stored as JSONB float arrays (text-embedding-3-small).
 */
import { createHash } from "crypto";
import { embedTexts } from "@/lib/ai/embed-text";

export const MESSAGE_EMBED_MODEL = "text-embedding-3-small";
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
 * Load cached vectors for messages; embed + upsert any that are missing or stale.
 * Returns a Map messageId → vector (only for messages that have a usable vector).
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
    .select("message_id, content_hash, embedding")
    .eq("project_id", projectId)
    .in("message_id", ids);

  const byId = new Map<string, EmbedRow>(
    ((cached ?? []) as EmbedRow[]).map((r) => [r.message_id, r]),
  );

  const needEmbed: Array<{ id: string; excerpt: string; hash: string }> = [];
  for (const m of messages) {
    const excerpt = messageEmbedExcerpt(m.content);
    if (!excerpt.trim()) continue;
    const hash = hashEmbedContent(excerpt);
    const row = byId.get(m.id);
    const vec = row ? asVector(row.embedding) : null;
    if (row && row.content_hash === hash && vec) {
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
    const vectors = await embedTexts(batch.map((b) => b.excerpt));
    if (!vectors || vectors.length !== batch.length) continue;

    const upserts = batch.map((b, idx) => ({
      message_id: b.id,
      project_id: projectId,
      content_hash: b.hash,
      model: MESSAGE_EMBED_MODEL,
      embedding: vectors[idx]!,
      updated_at: new Date().toISOString(),
    }));

    await supabase.from("message_embeddings").upsert(upserts, {
      onConflict: "message_id",
    });

    batch.forEach((b, idx) => out.set(b.id, vectors[idx]!));
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
  const vectors = await embedTexts([excerpt]);
  if (!vectors?.[0]) return;
  await supabase.from("message_embeddings").upsert(
    {
      message_id: messageId,
      project_id: projectId,
      content_hash: hashEmbedContent(excerpt),
      model: MESSAGE_EMBED_MODEL,
      embedding: vectors[0],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "message_id" },
  );
}
