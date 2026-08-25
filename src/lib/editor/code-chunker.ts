/**
 * AST-shaped, dependency-free code chunking for the project code index.
 *
 * Cursor-style indexing chunks along code structure, not fixed windows, so
 * a retrieved chunk is a whole function/component rather than half of one.
 * This chunker approximates that with top-level-declaration boundary
 * detection + brace tracking — deliberately pure and synchronous so it can
 * run anywhere (server, tests) with zero wasm/native dependencies, and
 * deterministically (same input → same chunks → same content hashes).
 *
 * String/template/comment state is tracked so a brace inside "…", `…` or
 * /* … *​/ never corrupts the depth counter.
 */

export interface CodeChunk {
  chunkIndex: number;
  /** 1-based inclusive */
  startLine: number;
  /** 1-based inclusive */
  endLine: number;
  /** "decl" for declaration-aligned chunks, "window" for fallback windows */
  kind: "decl" | "window";
  /** Best-effort name of the leading declaration ("" when unknown) */
  name: string;
  text: string;
}

const MAX_FILE_BYTES = 200_000;
const MAX_CHUNK_LINES = 150;
const MIN_CHUNK_LINES = 15;
const WINDOW_LINES = 80;

const CODE_EXT = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;
const TEXTISH_EXT = /\.(css|scss|html|md|json|sql|py|yml|yaml)$/i;

const SKIP_PATH =
  /(^|\/)(node_modules|dist|build|\.next|\.output|coverage)\/|(\.min\.)|(\.gen\.tsx?$)|(^|\/)package-lock\.json$|(^|\/)routeTree\.gen\.ts$|\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|wasm|lock)$/i;

export function isIndexablePath(path: string): boolean {
  if (SKIP_PATH.test(path)) return false;
  return CODE_EXT.test(path) || TEXTISH_EXT.test(path);
}

const DECL_RE =
  /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var|abstract\s+class)\b/;

function declName(line: string): string {
  const m = line.match(
    /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?|class|interface|type|enum|const|let|var|abstract\s+class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
  );
  return m?.[1] ?? "";
}

interface ScanState {
  depth: number;
  inBlockComment: boolean;
  inTemplate: boolean;
}

/** Advance scan state across one line (brace depth outside strings/comments). */
function scanLine(line: string, st: ScanState): void {
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  while (i < line.length) {
    const c = line[i]!;
    const next = line[i + 1];
    if (inLineComment) break;
    if (st.inBlockComment) {
      if (c === "*" && next === "/") {
        st.inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inSingle) {
      if (c === "\\") i++;
      else if (c === "'") inSingle = false;
      i++;
      continue;
    }
    if (inDouble) {
      if (c === "\\") i++;
      else if (c === '"') inDouble = false;
      i++;
      continue;
    }
    if (st.inTemplate) {
      if (c === "\\") i++;
      else if (c === "`") st.inTemplate = false;
      // ${ } interpolation braces still count toward depth on purpose:
      // they open and close symmetrically, so net depth is unaffected.
      else if (c === "{") st.depth++;
      else if (c === "}") st.depth = Math.max(0, st.depth - 1);
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      st.inBlockComment = true;
      i += 2;
      continue;
    }
    if (c === "'") inSingle = true;
    else if (c === '"') inDouble = true;
    else if (c === "`") st.inTemplate = true;
    else if (c === "{" || c === "(" || c === "[") st.depth++;
    else if (c === "}" || c === ")" || c === "]") st.depth = Math.max(0, st.depth - 1);
    i++;
  }
}

/** Fixed-window fallback for non-JS-family text files. */
function windowChunks(lines: string[]): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  for (let start = 0; start < lines.length; start += WINDOW_LINES) {
    const end = Math.min(lines.length, start + WINDOW_LINES);
    const text = lines.slice(start, end).join("\n");
    if (!text.trim()) continue;
    chunks.push({
      chunkIndex: chunks.length,
      startLine: start + 1,
      endLine: end,
      kind: "window",
      name: "",
      text,
    });
  }
  return chunks;
}

export function chunkSourceFile(path: string, content: string): CodeChunk[] {
  if (!content.trim() || content.length > MAX_FILE_BYTES) return [];
  const lines = content.split("\n");

  if (!CODE_EXT.test(path)) return windowChunks(lines);

  // 1) find top-level declaration start lines
  const st: ScanState = { depth: 0, inBlockComment: false, inTemplate: false };
  const declStarts: number[] = []; // 0-based line indexes
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln]!;
    if (
      st.depth === 0 &&
      !st.inBlockComment &&
      !st.inTemplate &&
      DECL_RE.test(line)
    ) {
      declStarts.push(ln);
    }
    scanLine(line, st);
  }
  if (declStarts.length === 0 || declStarts[0]! > 0) declStarts.unshift(0);

  // 2) segments between declaration starts
  const segments: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < declStarts.length; i++) {
    const start = declStarts[i]!;
    const end = i + 1 < declStarts.length ? declStarts[i + 1]! - 1 : lines.length - 1;
    if (end >= start) segments.push({ start, end });
  }

  // 3) merge small segments forward; split oversized ones at blank lines
  const merged: Array<{ start: number; end: number }> = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    const segLen = seg.end - seg.start + 1;
    const prevLen = prev ? prev.end - prev.start + 1 : 0;
    if (prev && prevLen + segLen <= MAX_CHUNK_LINES && prevLen < MIN_CHUNK_LINES) {
      prev.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }

  const finalSegs: Array<{ start: number; end: number }> = [];
  for (const seg of merged) {
    let cur = seg.start;
    while (seg.end - cur + 1 > MAX_CHUNK_LINES) {
      // split at the last blank line within the window, else hard cut
      let cut = -1;
      const limit = cur + MAX_CHUNK_LINES - 1;
      for (let ln = limit; ln > cur + MIN_CHUNK_LINES; ln--) {
        if (lines[ln]!.trim() === "") {
          cut = ln;
          break;
        }
      }
      if (cut < 0) cut = limit;
      finalSegs.push({ start: cur, end: cut });
      cur = cut + 1;
    }
    finalSegs.push({ start: cur, end: seg.end });
  }

  const chunks: CodeChunk[] = [];
  for (const seg of finalSegs) {
    const text = lines.slice(seg.start, seg.end + 1).join("\n");
    if (!text.trim()) continue;
    chunks.push({
      chunkIndex: chunks.length,
      startLine: seg.start + 1,
      endLine: seg.end + 1,
      kind: "decl",
      name: declName(lines[seg.start]!) || declName(lines[seg.start + 1] ?? ""),
      text,
    });
  }
  return chunks;
}
