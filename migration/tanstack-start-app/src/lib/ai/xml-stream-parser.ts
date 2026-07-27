/**
 * Incremental XML-tagged file update parser for streaming AI responses.
 *
 * Expected tags (Lovable-style surgical edits):
 *
 *   <file_update path="src/App.tsx" language="tsx">
 *     <full>…entire file…</full>
 *   </file_update>
 *
 *   <file_update path="src/App.tsx">
 *     <search>old snippet</search>
 *     <replace>new snippet</replace>
 *   </file_update>
 *
 * Only *complete* <file_update>…</file_update> blocks are emitted — partial
 * tags at the end of the buffer are held until the closing tag arrives.
 */

export type FileUpdateKind = "full" | "patch";

export interface ParsedFileUpdate {
  path: string;
  language?: string;
  kind: FileUpdateKind;
  /** Present when kind === "full" */
  content?: string;
  /** Present when kind === "patch" */
  search?: string;
  replace?: string;
}

export interface XmlStreamParserOptions {
  /** Max buffer size before we trim processed prefix (default 2MB) */
  maxBufferBytes?: number;
  onUpdate: (update: ParsedFileUpdate) => void | Promise<void>;
  onParseError?: (error: string, rawSnippet: string) => void;
}

const FILE_UPDATE_OPEN = /<file_update\b([^>]*)>/i;
const FILE_UPDATE_CLOSE = /<\/file_update>/i;
const ATTR_PATH = /\bpath=["']([^"']+)["']/i;
const ATTR_LANG = /\blanguage=["']([^"']+)["']/i;

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTagContent(inner: string, tag: string): string | null {
  const open = new RegExp(`<${tag}\\b[^>]*>`, "i");
  const close = new RegExp(`</${tag}>`, "i");
  const o = inner.match(open);
  if (!o || o.index === undefined) return null;
  const start = o.index + o[0].length;
  const rest = inner.slice(start);
  const c = rest.match(close);
  if (!c || c.index === undefined) return null;
  return decodeXmlEntities(rest.slice(0, c.index).trim());
}

function parseFileUpdateBlock(attrs: string, inner: string): ParsedFileUpdate | null {
  const pathMatch = attrs.match(ATTR_PATH);
  if (!pathMatch?.[1]) return null;
  const path = pathMatch[1].replace(/\\/g, "/").replace(/^\//, "");
  const langMatch = attrs.match(ATTR_LANG);

  const full = extractTagContent(inner, "full");
  if (full !== null) {
    return {
      path,
      language: langMatch?.[1],
      kind: "full",
      content: full,
    };
  }

  const search = extractTagContent(inner, "search");
  const replace = extractTagContent(inner, "replace");
  if (search !== null && replace !== null) {
    return {
      path,
      language: langMatch?.[1],
      kind: "patch",
      search,
      replace,
    };
  }

  return null;
}

export class XmlStreamParser {
  private buffer = "";
  private readonly maxBytes: number;

  constructor(private readonly opts: XmlStreamParserOptions) {
    this.maxBytes = opts.maxBufferBytes ?? 2 * 1024 * 1024;
  }

  get pendingBufferLength(): number {
    return this.buffer.length;
  }

  /** Feed raw text (already decoded from SSE if applicable). */
  feed(chunk: string): void {
    if (!chunk) return;
    this.buffer += chunk;
    if (this.buffer.length > this.maxBytes) {
      // Drop oldest processed prefix — keep last 512KB for tag completion
      this.buffer = this.buffer.slice(-512 * 1024);
    }
    this.drainCompleteBlocks();
  }

  /** Call when the upstream stream closes to flush any trailing complete blocks. */
  flush(): void {
    this.drainCompleteBlocks(true);
  }

  reset(): void {
    this.buffer = "";
  }

  private drainCompleteBlocks(final = false): void {
    let safety = 0;
    while (safety++ < 200) {
      const open = this.buffer.match(FILE_UPDATE_OPEN);
      if (!open || open.index === undefined) break;

      const afterOpen = open.index + open[0].length;
      const tail = this.buffer.slice(afterOpen);
      const close = tail.match(FILE_UPDATE_CLOSE);
      if (!close || close.index === undefined) {
        if (!final) break;
        // Incomplete block at end — report if we have attrs but no close
        break;
      }

      const inner = tail.slice(0, close.index);
      const attrs = open[1] ?? "";
      const parsed = parseFileUpdateBlock(attrs, inner);

      const consumed = afterOpen + close.index + close[0].length;
      this.buffer = this.buffer.slice(consumed);

      if (!parsed) {
        this.opts.onParseError?.(
          "Malformed <file_update> block (missing path, <full>, or <search>/<replace>)",
          inner.slice(0, 400),
        );
        continue;
      }

      try {
        const r = this.opts.onUpdate(parsed);
        if (r && typeof (r as Promise<void>).then === "function") {
          void (r as Promise<void>).catch((e: unknown) => {
            this.opts.onParseError?.(
              e instanceof Error ? e.message : "onUpdate failed",
              parsed.path,
            );
          });
        }
      } catch (e) {
        this.opts.onParseError?.(
          e instanceof Error ? e.message : "onUpdate threw",
          parsed.path,
        );
      }
    }
  }
}

/** Apply a patch update to existing file content. Returns null if search not found uniquely. */
export function applySearchReplace(
  current: string,
  search: string,
  replace: string,
): { ok: true; content: string } | { ok: false; reason: string } {
  const idx = current.indexOf(search);
  if (idx === -1) {
    return { ok: false, reason: "search block not found in file" };
  }
  const lastIdx = current.lastIndexOf(search);
  if (idx !== lastIdx) {
    return { ok: false, reason: "search block matches multiple locations — need more context" };
  }
  return { ok: true, content: current.slice(0, idx) + replace + current.slice(idx + search.length) };
}
