/**
 * Lightweight text embeddings for in-app search (direct OpenAI API only —
 * OpenRouter has no embeddings endpoint; see the note below).
 * Returns null when no provider is configured — callers should fall back to keyword search.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const clean = texts.map((t) => t.trim().slice(0, 2000)).filter(Boolean);
  if (!clean.length) return [];

  const openaiKey = process.env.OPENAI_API_KEY;
  // The OpenRouter branch here was DEAD CODE (verified 2026-08-19): OpenRouter
  // does not serve an embeddings endpoint at all, and "openai/text-embedding-3-small"
  // is absent from its model catalog. So whenever OPENAI_API_KEY was unset — which
  // is the normal configuration for this deployment — every call POSTed to a URL
  // that 404s, fell into the `!res.ok` branch, and returned null. Semantic search
  // has therefore been silently degraded to keyword matching, with nothing logged.
  //
  // Now it fails honestly and immediately instead of burning a round-trip, and the
  // caller's keyword fallback kicks in for the same reason it always did. To
  // actually enable semantic search, set OPENAI_API_KEY (embeddings are one of the
  // few things this product cannot route through OpenRouter).
  if (!openaiKey) return null;

  const url = "https://api.openai.com/v1/embeddings";
  const model = "text-embedding-3-small";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model, input: clean }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  if (!data.data?.length) return null;
  return data.data.map((row) => row.embedding);
}
