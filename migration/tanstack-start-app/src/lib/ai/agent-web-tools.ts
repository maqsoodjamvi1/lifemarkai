/**
 * Web tools for the agent loop — Lovable-agent parity.
 *
 * `searchWeb(query)` tries, in order:
 *   1. Serper (SERPER_API_KEY) — Google results, best quality
 *   2. Brave Search (BRAVE_SEARCH_API_KEY)
 *   3. DuckDuckGo html endpoint — no key required (best-effort parse)
 *
 * `fetchUrlAsText(url)` reuses the SSRF-guarded reference-page fetcher.
 * Both fail soft (return a message string, never throw) so a network issue
 * can't kill an agent run.
 */

import { fetchReferencePage, isFetchablePublicUrl } from "./page-reference.ts";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

const SEARCH_TIMEOUT_MS = 8000;

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function serperSearch(query: string, key: string): Promise<WebSearchResult[] | null> {
  const res = await timedFetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 6 }),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> } | null;
  if (!data?.organic) return null;
  return data.organic.slice(0, 6).map((r) => ({
    title: r.title ?? "",
    url: r.link ?? "",
    snippet: r.snippet ?? "",
  }));
}

async function braveSearch(query: string, key: string): Promise<WebSearchResult[] | null> {
  const res = await timedFetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6`,
    { headers: { "X-Subscription-Token": key, Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } } | null;
  const results = data?.web?.results;
  if (!results) return null;
  return results.slice(0, 6).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.description ?? "").replace(/<[^>]+>/g, ""),
  }));
}

/** Keyless fallback — parse DuckDuckGo's html endpoint (best effort). */
async function duckDuckGoSearch(query: string): Promise<WebSearchResult[] | null> {
  const res = await timedFetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; LifemarkAgent/1.0)" } },
  );
  if (!res.ok) return null;
  const html = await res.text();
  const out: WebSearchResult[] = [];
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html)) !== null) snippets.push(sm[1]);
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && out.length < 6) {
    let href = m[1];
    // DDG wraps results: //duckduckgo.com/l/?uddg=<encoded>
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    out.push({ title: strip(m[2]), url: href, snippet: strip(snippets[out.length] ?? "") });
  }
  return out.length > 0 ? out : null;
}

export async function searchWeb(query: string): Promise<{ results: WebSearchResult[]; provider: string } | { error: string }> {
  const q = query.trim().slice(0, 300);
  if (!q) return { error: "Empty query" };
  try {
    const serperKey = process.env.SERPER_API_KEY;
    if (serperKey) {
      const r = await serperSearch(q, serperKey).catch(() => null);
      if (r) return { results: r, provider: "serper" };
    }
    const braveKey = process.env.BRAVE_SEARCH_API_KEY;
    if (braveKey) {
      const r = await braveSearch(q, braveKey).catch(() => null);
      if (r) return { results: r, provider: "brave" };
    }
    const r = await duckDuckGoSearch(q).catch(() => null);
    if (r) return { results: r, provider: "duckduckgo" };
    return { error: "No search results (all providers failed)" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "search failed" };
  }
}

/** SSRF-guarded page fetch → readable text (capped). */
export async function fetchUrlAsText(url: string): Promise<{ url: string; text: string } | { error: string }> {
  const raw = url.trim();
  if (!isFetchablePublicUrl(raw)) {
    return { error: "URL is not fetchable (must be a public http(s) address)" };
  }
  const text = await fetchReferencePage(raw);
  if (!text) return { error: "Fetch failed or page had no readable content" };
  return { url: raw, text: text.slice(0, 6000) };
}

/**
 * Read-only SQL guard for the agent's db_query tool. STRICT by design:
 * single statement, must start with SELECT/WITH/EXPLAIN/SHOW, and no write
 * keyword anywhere (even in strings — false negatives are acceptable, the
 * agent can rephrase; false positives are not).
 */
export function isReadOnlySql(sql: string): boolean {
  const cleaned = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim();
  if (!cleaned) return false;
  const body = cleaned.endsWith(";") ? cleaned.slice(0, -1) : cleaned;
  if (body.includes(";")) return false;
  if (!/^(select|with|explain|show)\b/i.test(body)) return false;
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|vacuum|copy|call|do)\b/i.test(body)) return false;
  return true;
}
