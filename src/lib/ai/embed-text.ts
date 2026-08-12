/**
 * Lightweight text embeddings for in-app search (OpenAI or OpenRouter).
 * Returns null when no provider is configured — callers should fall back to keyword search.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const clean = texts.map((t) => t.trim().slice(0, 2000)).filter(Boolean);
  if (!clean.length) return [];

  const openaiKey = process.env.OPENAI_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!openaiKey && !orKey) return null;

  const url = openaiKey
    ? "https://api.openai.com/v1/embeddings"
    : "https://openrouter.ai/api/v1/embeddings";
  const model = openaiKey ? "text-embedding-3-small" : "openai/text-embedding-3-small";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey ?? orKey}`,
      ...(orKey && !openaiKey ? { "HTTP-Referer": "https://lifemark.ai" } : {}),
    },
    body: JSON.stringify({ model, input: clean }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  if (!data.data?.length) return null;
  return data.data.map((row) => row.embedding);
}
