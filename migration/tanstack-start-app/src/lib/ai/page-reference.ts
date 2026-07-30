/**
 * Reference-page fetching for Build-with-URL `html=` links (Lovable parity,
 * Jun 16 2026: "Reference web pages in a Build with URL link").
 *
 * When a build prompt carries a "Reference pages:" block, the chat route
 * fetches each public page server-side, strips it to readable text +
 * structural hints, and injects it as reference context so the AI can
 * recreate/iterate on the page's layout, content, and styling.
 */

const MAX_PAGES = 2;
const MAX_BYTES = 400_000;
const MAX_TEXT_CHARS = 8_000;
const FETCH_TIMEOUT_MS = 10_000;

/** Extract reference-page URLs from a prompt's "Reference pages:" block. */
export function extractReferencePages(message: string): string[] {
  const m = /Reference pages:\s*\n((?:\s*-\s*https?:\/\/\S+\s*\n?)+)/i.exec(message);
  if (!m) return [];
  return [...m[1].matchAll(/https?:\/\/\S+/g)]
    .map((u) => u[0].replace(/[),.]+$/, ""))
    .slice(0, MAX_PAGES);
}

/** SSRF guard: public http(s) hosts only — private/loopback/link-local
 *  ranges and obvious internal names are refused. Hostname-pattern level
 *  (no DNS resolution), which matches the threat model: the URL came from
 *  the user's own build link. */
export function isFetchablePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "0.0.0.0" || host === "[::1]" || host === "::1") return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false; // link-local / cloud metadata
  return true;
}

/** Strip HTML to readable text with light structural hints. Pure. */
export function htmlToReferenceText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  // Structural hints before tag-stripping
  s = s
    .replace(/<h1[^>]*>/gi, "\n# ")
    .replace(/<h2[^>]*>/gi, "\n## ")
    .replace(/<h3[^>]*>/gi, "\n### ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(p|div|section|article|header|footer|nav|br)[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  // Entity basics
  s = s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, MAX_TEXT_CHARS);
}

/** Fetch one reference page → readable text, or null on any failure. */
export async function fetchReferencePage(url: string): Promise<string | null> {
  if (!isFetchablePublicUrl(url)) return null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "LifemarkAI-reference-fetch/1.0 (+https://lifemarkai.com)" },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return null;
    const text = await res.text();
    return htmlToReferenceText(text.slice(0, MAX_BYTES));
  } catch {
    return null;
  }
}

/** Build the system-prompt block for all reference pages in a message. */
export async function buildPageReferenceBlock(message: string): Promise<string | null> {
  const urls = extractReferencePages(message);
  if (urls.length === 0) return null;
  const sections: string[] = [];
  for (const url of urls) {
    const text = await fetchReferencePage(url);
    if (text) sections.push(`## Reference page: ${url}\n${text}`);
  }
  if (sections.length === 0) return null;
  return `\n\n---\n# Reference Pages (user-provided via Build-with-URL)\nUse these pages as references for layout, content, and styling. Recreate or iterate on their structure as the prompt asks — do NOT copy branding/trademarks verbatim.\n\n${sections.join("\n\n")}\n---`;
}
