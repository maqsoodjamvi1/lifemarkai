/**
 * Source-reference detection for chat and plan text.
 *
 * Two syntaxes are recognized:
 *   @src/components/Button.tsx:42     — explicit, what our own tooling emits
 *   Button.tsx:42                     — bare, what models write naturally
 *                                       (Lovable parity, Jun 10 2026)
 *
 * The bare form is the whole difficulty: `foo:42` is a common shape in prose
 * that has nothing to do with source files (`localhost:3000`, `12:30`,
 * `https://host:8080/x`, `Error at line:42`). Everything here exists to keep
 * those out while still catching a filename the model mentions in passing.
 *
 * Guard rails, in order of how often they actually fire:
 *   1. The stem must end in a known code/asset extension. `report:42` is not a
 *      ref; `report.tsx:42` is.
 *   2. A ref must not be preceded by `:` or `/` — that kills `host:8080/a.ts:4`
 *      and protocol-relative URLs without needing a URL parser.
 *   3. Fenced code blocks are never touched (handled by the caller's split).
 *   4. Inline code spans are never touched — a ref inside backticks is being
 *      shown as literal text, not linked.
 *
 * Keep this a pure string→string transform: it runs on every message render,
 * and it is unit-tested directly (see line-refs.test.ts).
 */

/**
 * Extensions we accept on a bare reference. Deliberately narrow — every entry
 * here is a file type a generated project actually contains, because each one
 * added is a new chance to linkify something that only looked like a path.
 */
const CODE_EXTENSIONS = [
  "tsx", "ts", "jsx", "js", "mjs", "cjs",
  "css", "scss", "html", "json", "md", "mdx",
  "py", "rs", "go", "rb", "java", "php", "sql",
  "vue", "svelte", "yml", "yaml", "toml", "sh",
];

const EXT_GROUP = CODE_EXTENSIONS.join("|");

/**
 * Explicit form: `@path/to/File.tsx:42` or `@File.tsx:42-58`.
 * The leading `@` is proof of intent, so the path shape can be permissive.
 */
export const EXPLICIT_REF_RE = new RegExp(
  String.raw`@([\w./\-]+\.(?:${EXT_GROUP})):(\d+)(?:-(\d+))?\b`,
  "g",
);

/**
 * Bare form: `Button.tsx:42`, `src/lib/db.ts:120-140`.
 *
 * `(^|[^\w@:/.])` — the character before the ref must not be a word char,
 * `@` (that is the explicit form, matched first), `:` (port/time), `/` (part
 * of a longer path or URL), or `.` (mid-identifier). It is captured so the
 * replacement can put it back.
 */
export const BARE_REF_RE = new RegExp(
  String.raw`(^|[^\w@:/.])((?:[\w.\-]+/)*[\w.\-]+\.(?:${EXT_GROUP})):(\d+)(?:-(\d+))?\b`,
  "g",
);

export interface ParsedRef {
  /** Full matched text, e.g. "Button.tsx:42" (no leading `@`). */
  raw: string;
  path: string;
  line: number;
  endLine: number | null;
}

/** Split on fenced code blocks; odd indices are the fences themselves. */
function splitFences(content: string): string[] {
  return content.split(/(```[\s\S]*?```)/);
}

/** Split on inline code spans; odd indices are the spans themselves. */
function splitInlineCode(segment: string): string[] {
  return segment.split(/(`[^`\n]*`)/);
}

/**
 * Find every source reference in `content`, skipping code blocks and spans.
 * Used for analysis/telemetry and by the tests; rendering uses
 * {@link linkifySourceRefs}.
 */
export function findSourceRefs(content: string): ParsedRef[] {
  const out: ParsedRef[] = [];
  const fences = splitFences(content);
  for (let i = 0; i < fences.length; i++) {
    if (i % 2 === 1) continue;
    const spans = splitInlineCode(fences[i]);
    for (let j = 0; j < spans.length; j++) {
      if (j % 2 === 1) continue;
      const seg = spans[j];
      for (const m of seg.matchAll(EXPLICIT_REF_RE)) {
        out.push({
          raw: m[0],
          path: m[1],
          line: parseInt(m[2], 10),
          endLine: m[3] ? parseInt(m[3], 10) : null,
        });
      }
      for (const m of seg.matchAll(BARE_REF_RE)) {
        out.push({
          raw: m[0].slice(m[1].length),
          path: m[2],
          line: parseInt(m[3], 10),
          endLine: m[4] ? parseInt(m[4], 10) : null,
        });
      }
    }
  }
  return out;
}

/** Markdown link target the renderer turns into a clickable pill. */
export function refHref(path: string, line: number, endLine?: number | null): string {
  const base = `#lm-ref/${encodeURIComponent(path)}/${line}`;
  return endLine ? `${base}/${endLine}` : base;
}

/**
 * Parse a `#lm-ref/...` href back into its parts. Returns null if malformed.
 *
 * `#lm-ref/X/42` splits into exactly three parts — the path is
 * percent-encoded, so it never contributes slashes of its own. Indices are
 * 1 = path, 2 = line, 3 = optional end line. Extracted from the inline
 * destructure in message-content.tsx so the round trip with {@link refHref}
 * is covered by tests rather than by eye.
 */
export function parseRefHref(
  href: string,
): { path: string; line: number; endLine: number | null } | null {
  if (!href.startsWith("#lm-ref/")) return null;
  const [, encodedPath, lineStr, endStr] = href.split("/");
  if (!encodedPath) return null;
  const line = parseInt(lineStr ?? "", 10);
  if (!Number.isFinite(line) || line <= 0) return null;
  const end = endStr ? parseInt(endStr, 10) : NaN;
  return {
    path: decodeURIComponent(encodedPath),
    line,
    endLine: Number.isFinite(end) && end > 0 ? end : null,
  };
}

/**
 * Rewrite both reference syntaxes into markdown links, plus the Security
 * Memory mention. Code blocks and inline code are passed through untouched.
 */
export function linkifySourceRefs(content: string): string {
  const SECURITY = /@security-memory\b|Security Memory/g;
  return splitFences(content)
    .map((seg, i) => {
      if (i % 2 === 1) return seg;
      return splitInlineCode(seg)
        .map((span, j) => {
          if (j % 2 === 1) return span;
          return span
            .replace(SECURITY, () => `[Security Memory](#lm-security-memory)`)
            // Explicit first: its `@` would otherwise be left stranded outside
            // a bare match, rendering as a literal "@" next to the pill.
            .replace(EXPLICIT_REF_RE, (m, path: string, start: string, end?: string) =>
              `[${m}](${refHref(path, parseInt(start, 10), end ? parseInt(end, 10) : null)})`,
            )
            .replace(
              BARE_REF_RE,
              (_m, pre: string, path: string, start: string, end?: string) => {
                const label = end ? `${path}:${start}-${end}` : `${path}:${start}`;
                return `${pre}[${label}](${refHref(path, parseInt(start, 10), end ? parseInt(end, 10) : null)})`;
              },
            );
        })
        .join("");
    })
    .join("");
}

/** Cheap pre-check so callers can skip the work on most messages. */
export function mightContainRef(content: string): boolean {
  return content.includes(":") || content.includes("@");
}
