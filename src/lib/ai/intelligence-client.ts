/**
 * Client for the Python Intelligence Service (services/intelligence/).
 *
 * Optional dependency: every function here returns null/[] when
 * INTELLIGENCE_SERVICE_URL is unset or the service is unreachable, so
 * nothing that calls these breaks in environments where the service
 * isn't deployed (e.g. local dev without Docker running it).
 */

const BASE = process.env.INTELLIGENCE_SERVICE_URL;

async function postJson<T>(path: string, body: unknown, timeoutMs = 8000): Promise<T | null> {
  if (!BASE) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // network error, timeout, service down — caller falls back
  } finally {
    clearTimeout(timer);
  }
}

export interface LocalEmbedResponse {
  embeddings: number[][];
  dim: number;
  model: string;
}

/** Local embeddings via the Python service — no external API key required. */
export async function embedTextsLocal(texts: string[]): Promise<LocalEmbedResponse | null> {
  if (!texts.length) return { embeddings: [], dim: 0, model: "" };
  return postJson<LocalEmbedResponse>("/embed", { texts });
}

export interface RemoteSymbolInfo {
  kind: string;
  name: string;
  line: number;
  exported: boolean;
  signature?: string | null;
}

export interface RemoteFileAnalysis {
  path: string;
  imports: Array<{ what: string; source: string; line: number }>;
  symbols: RemoteSymbolInfo[];
  default_export?: string | null;
  loc: number;
}

/**
 * Real AST-based file analysis (tree-sitter) — more precise than
 * code-analyzer.ts's regex heuristics on nested braces, multi-line
 * signatures, and template literals. Falls back to null on any failure;
 * callers should fall back to analyzeFile() from code-analyzer.ts.
 */
export async function analyzeFileRemote(path: string, content: string): Promise<RemoteFileAnalysis | null> {
  return postJson<RemoteFileAnalysis>("/analyze/file", { path, content });
}

export async function findDefinitionRemote(
  files: Array<{ path: string; content: string }>,
  symbol: string,
): Promise<Array<{ file: string; line: number; kind: string; exported: boolean; signature?: string }> | null> {
  const result = await postJson<{ matches: Array<{ file: string; line: number; kind: string; exported: boolean; signature?: string }> }>(
    "/analyze/find-definition",
    { files, symbol },
  );
  return result?.matches ?? null;
}
