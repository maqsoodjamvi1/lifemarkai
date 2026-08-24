/**
 * Text embeddings for in-app search.
 *
 * Tries three sources in order:
 *   1. OpenAI (text-embedding-3-small, 1536-dim) — if OPENAI_API_KEY is set.
 *   2. Local Python Intelligence Service (all-MiniLM-L6-v2, 384-dim) — if
 *      INTELLIGENCE_SERVICE_URL is set. No API key, no per-call cost.
 *   3. null — callers fall back to keyword search, same as before.
 *
 * IMPORTANT: sources (1) and (2) return DIFFERENT vector dimensions
 * (1536 vs 384). Every result carries `model` and `dim` so callers can
 * record accurate provenance and reject/re-embed on a source change —
 * see src/lib/editor/message-embeddings.ts and cosineSimilarity's
 * dimension guard in src/lib/editor/search-chat-messages.ts. Comparing a
 * vector from one source against a cached vector from the other is a
 * silent-wrong-answer bug, not a crash — don't skip the dimension check.
 */
import { embedTextsLocal } from "@/lib/ai/intelligence-client";

export const OPENAI_EMBED_MODEL = "text-embedding-3-small";
// Code-trained model (768-dim) — see services/intelligence/core/embedder.py.
// Must match the service's EMBED_MODEL default; the service reports its actual
// model per-response, and that reported name is what gets persisted per row.
export const LOCAL_EMBED_MODEL = "jinaai/jina-embeddings-v2-base-code";

export interface EmbedResult {
  vectors: number[][];
  model: string;
  dim: number;
}

/**
 * Which model embedTexts() would use right now, WITHOUT making a network
 * call — just the same env-var check embedTexts() itself does. Cheap to
 * call on every cache-lookup to decide if a cached row's `model` is stale.
 * This is a best-effort hint, not a guarantee: e.g. an OpenAI call can still
 * fail at request time and fall through to the local service even though
 * this reports "openai" was configured. That's fine — cosineSimilarity's
 * dimension guard is the actual correctness backstop; this just avoids
 * unnecessary re-embeds in the common case.
 */
export function getExpectedEmbedModel(): string | null {
  if (process.env.OPENAI_API_KEY) return OPENAI_EMBED_MODEL;
  if (process.env.INTELLIGENCE_SERVICE_URL) return LOCAL_EMBED_MODEL;
  return null;
}

export async function embedTexts(texts: string[]): Promise<EmbedResult | null> {
  const clean = texts.map((t) => t.trim().slice(0, 2000)).filter(Boolean);
  if (!clean.length) return { vectors: [], model: "", dim: 0 };

  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) {
    const url = "https://api.openai.com/v1/embeddings";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input: clean }),
    });

    if (res.ok) {
      const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
      if (data.data?.length) {
        return {
          vectors: data.data.map((row) => row.embedding),
          model: OPENAI_EMBED_MODEL,
          dim: data.data[0].embedding.length,
        };
      }
    }
    // fall through to local service on OpenAI failure, don't just give up
  }

  // No OpenAI key (the normal case for this deployment per the 2026-08-19
  // audit note this replaces) or OpenAI call failed — try the local service.
  if (process.env.INTELLIGENCE_SERVICE_URL) {
    const local = await embedTextsLocal(clean);
    if (local?.embeddings.length) {
      return { vectors: local.embeddings, model: local.model || LOCAL_EMBED_MODEL, dim: local.dim };
    }
  }

  return null;
}
