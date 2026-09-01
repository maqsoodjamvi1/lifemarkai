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

/**
 * Locate the first COMPLETE `<file_update>…</file_update>` block in `buffer`.
 * Returns null when no complete block is present yet.
 *
 * This is the single definition of where a block begins and ends. Both the
 * streaming parser below and `parseFileUpdateBlocks` go through it, so the
 * client and the server can never disagree about block boundaries.
 */
function nextFileUpdateBlock(
  buffer: string,
): { attrs: string; inner: string; consumed: number } | null {
  const open = buffer.match(FILE_UPDATE_OPEN);
  if (!open || open.index === undefined) return null;

  const afterOpen = open.index + open[0].length;
  const tail = buffer.slice(afterOpen);
  const close = tail.match(FILE_UPDATE_CLOSE);
  if (!close || close.index === undefined) return null;

  return {
    attrs: open[1] ?? "",
    inner: tail.slice(0, close.index),
    consumed: afterOpen + close.index + close[0].length,
  };
}

/**
 * Parse every complete `<file_update>` block out of a whole response string.
 *
 * The non-streaming counterpart of `XmlStreamParser`, for consumers that already
 * hold the full text — chiefly the SERVER. The client streams the model's
 * response through `XmlStreamParser` and applies each block to its local file
 * state; the server must extract the same blocks from the same text in order to
 * PERSIST them. While only the client understood this format, a response that
 * complied with it updated the editor and saved nothing.
 *
 * Deliberately shares `nextFileUpdateBlock` and `parseFileUpdateBlock` with the
 * streaming path rather than re-implementing them: entity decoding, `.trim()` of
 * tag bodies and path normalisation must produce byte-identical results on both
 * sides, and the only way to guarantee that is to have one implementation.
 *
 * Malformed blocks are skipped, as in the streaming parser (which reports them
 * through `onParseError` and continues).
 */
export function parseFileUpdateBlocks(raw: string): ParsedFileUpdate[] {
  if (!raw || !FILE_UPDATE_OPEN.test(raw)) return [];
  const out: ParsedFileUpdate[] = [];
  let rest = raw;
  let safety = 0;
  while (safety++ < 200) {
    const block = nextFileUpdateBlock(rest);
    if (!block) break;
    rest = rest.slice(block.consumed);
    const parsed = parseFileUpdateBlock(block.attrs, block.inner);
    if (parsed) out.push(parsed);
  }
  return out;
}

export class XmlStreamParser {
  private buffer = "";
  private readonly maxBytes: number;

  // Longhand, not a parameter property — see the note in
  // streaming-file-extractor.ts: parameter properties are the one TS feature
  // `node --test --experimental-strip-types` cannot handle, and this class is
  // imported by code-parser.ts, so the whole parser test suite depended on it.
  private readonly opts: XmlStreamParserOptions;

  constructor(opts: XmlStreamParserOptions) {
    this.opts = opts;
    this.maxBytes = opts.maxBufferBytes ?? 2 * 1024 * 1024;
  }

  get pendingBufferLength(): number {
    return this.buffer.length;
  }

  /** Feed raw text (already decoded from SSE if applicable). */
  feed(chunk: string): void {
    if (!chunk) return;
    this.buffer += chunk;
    // Drain BEFORE trimming. The old order trimmed first — so any complete
    // block sitting in the part about to be dropped was destroyed unread,
    // and worse, an in-progress block's own OPENING tag (with its path
    // attribute) could be more than 512KB from the buffer's end and get cut
    // off too, making that block permanently unrecoverable: nextFileUpdateBlock
    // can never find it again, no onParseError fires (it only fires for a
    // block that WAS found but failed to parse), and the file just never
    // appears in the live preview while streaming — "why didn't my file show
    // up" with no error anywhere. Draining first means every block that IS
    // complete gets removed (and its buffer space reclaimed) before any
    // trimming decision is made.
    this.drainCompleteBlocks();
    if (this.buffer.length > this.maxBytes) {
      const open = this.buffer.match(FILE_UPDATE_OPEN);
      if (open && open.index !== undefined) {
        // An in-progress block is still streaming (drainCompleteBlocks just
        // ran and didn't consume it, so its closing tag hasn't arrived yet).
        // Only trim plain-text preamble strictly BEFORE its opening tag —
        // never the tag itself or anything after it — so the block stays
        // recoverable no matter how large it grows before it closes.
        if (open.index > 0) this.buffer = this.buffer.slice(open.index);
      } else {
        // No pending block at all, just accumulated prose/chatter between
        // blocks. Safe to drop all but a small tail, in case a new opening
        // tag is about to start arriving mid-chunk.
        this.buffer = this.buffer.slice(-512 * 1024);
      }
    }
  }

  /** Call when the upstream stream closes to flush any trailing complete blocks. */
  flush(): void {
    this.drainCompleteBlocks(true);
  }

  reset(): void {
    this.buffer = "";
  }

  private drainCompleteBlocks(final = false): void {
    // `final` is accepted for symmetry with flush() but changes nothing: an
    // incomplete trailing block is left in the buffer either way, since there is
    // no safe way to apply half a file.
    void final;
    let safety = 0;
    while (safety++ < 200) {
      const block = nextFileUpdateBlock(this.buffer);
      if (!block) break;

      this.buffer = this.buffer.slice(block.consumed);
      const parsed = parseFileUpdateBlock(block.attrs, block.inner);
      const inner = block.inner;

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
