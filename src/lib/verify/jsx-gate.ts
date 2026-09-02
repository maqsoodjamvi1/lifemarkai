/**
 * Server-side JSX preview gate — Node/TypeScript only.
 *
 * Generated apps often paste HTML into .tsx (`class=` / `for=` / `onclick=`).
 * React ignores those attributes, so the preview looks "broken" and a model
 * round was spent rediscovering a rename. Missing list `key`s are the same
 * class: a console error on an otherwise working page.
 *
 * This module scans JSX tags (never string/comment contents) and rewrites
 * the unique mappings. Anything ambiguous is left for tsc / the LLM.
 */

import { findMissingListKeys } from "./typecheck-gate.ts";

export interface JsxFile {
  path: string;
  content?: string | null;
}

export interface JsxDefect {
  path: string;
  line: number;
  formatted: string;
}

const EVENT_RENAMES: Record<string, string> = {
  onclick: "onClick",
  onchange: "onChange",
  onsubmit: "onSubmit",
  oninput: "onInput",
  onkeydown: "onKeyDown",
  onkeyup: "onKeyUp",
  onkeypress: "onKeyPress",
  onfocus: "onFocus",
  onblur: "onBlur",
  onmouseover: "onMouseOver",
  onmouseout: "onMouseOut",
  onmousedown: "onMouseDown",
  onmouseup: "onMouseUp",
  onmousemove: "onMouseMove",
  onscroll: "onScroll",
  onload: "onLoad",
  onerror: "onError",
  ondoubleclick: "onDoubleClick",
};

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/**
 * Walk source, skipping strings/comments, and rewrite HTML attrs inside JSX tags.
 */
export function rewriteJsxHtmlAttributes(source: string): { content: string; count: number } {
  const out: string[] = [];
  let i = 0;
  let count = 0;
  const n = source.length;

  const pushRange = (from: number, to: number) => {
    out.push(source.slice(from, to));
  };

  while (i < n) {
    const c = source[i]!;

    if (c === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      const to = end === -1 ? n : end + 1;
      pushRange(i, to);
      i = to;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const to = end === -1 ? n : end + 2;
      pushRange(i, to);
      i = to;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          j += 1;
          break;
        }
        if (quote === "`" && source[j] === "$" && source[j + 1] === "{") break;
        j += 1;
      }
      pushRange(i, j);
      i = j;
      continue;
    }

    if (c === "<" && /[A-Za-z/]/.test(source[i + 1] ?? "")) {
      if (source[i + 1] === "/") {
        const close = source.indexOf(">", i + 2);
        const to = close === -1 ? n : close + 1;
        pushRange(i, to);
        i = to;
        continue;
      }
      const tagEnd = findTagEnd(source, i);
      const tag = source.slice(i, tagEnd);
      const rewritten = rewriteTag(tag);
      if (rewritten !== tag) count += 1;
      out.push(rewritten);
      i = tagEnd;
      continue;
    }

    out.push(c);
    i += 1;
  }

  return { content: out.join(""), count };
}

function findTagEnd(source: string, start: number): number {
  let i = start + 1;
  let quote: string | null = null;
  let brace = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (quote) {
      if (c === "\\" && quote !== "`") {
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      i += 1;
      continue;
    }
    if (c === "{") {
      brace += 1;
      i += 1;
      continue;
    }
    if (c === "}" && brace > 0) {
      brace -= 1;
      i += 1;
      continue;
    }
    if (brace === 0 && c === ">") return i + 1;
    i += 1;
  }
  return source.length;
}

function rewriteTag(tag: string): string {
  const match = tag.match(/^<([A-Za-z][\w.-]*)([\s\S]*)$/);
  if (!match) return tag;
  const name = match[1]!;
  let rest = match[2]!;
  const isLabel = /^label$/i.test(name);

  rest = rest.replace(/(?<=\s)class(?==)/g, () => "className");
  if (isLabel) {
    rest = rest.replace(/(?<=\s)for(?==)/g, () => "htmlFor");
  }
  rest = rest.replace(/(?<=\s)([a-z]+)=/g, (whole, attr: string) => {
    const next = EVENT_RENAMES[attr];
    return next ? `${next}=` : whole;
  });
  return `<${name}${rest}`;
}

export function findJsxHtmlAttributeDefects(files: JsxFile[]): JsxDefect[] {
  const out: JsxDefect[] = [];
  for (const file of files) {
    if (typeof file.path !== "string" || typeof file.content !== "string") continue;
    if (!/\.(tsx|jsx)$/i.test(file.path)) continue;
    const { content } = rewriteJsxHtmlAttributes(file.content);
    if (content === file.content) continue;
    out.push({
      path: file.path,
      line: 1,
      formatted: `${file.path} — HTML attributes in JSX (class/for/onclick) must be React names (className/htmlFor/onClick)`,
    });
  }
  return out;
}

/**
 * Insert `key={i}` on the first JSX element returned from `.map()` and ensure
 * the callback has an index parameter. Index keys are enough to silence the
 * React console error on generated static lists; unique ids stay an LLM job.
 */
export function repairMissingListKeys<T extends JsxFile>(files: T[]): { files: T[]; changedPaths: string[] } {
  const changedPaths: string[] = [];
  const next = files.map((file) => {
    if (typeof file.path !== "string" || typeof file.content !== "string") return file;
    if (!/\.(tsx|jsx)$/i.test(file.path)) return file;
    const repaired = insertMapKeys(file.content);
    if (repaired === file.content) return file;
    changedPaths.push(file.path);
    return { ...file, content: repaired };
  });
  return { files: next, changedPaths };
}

function insertMapKeys(source: string): string {
  let content = source;
  for (let guard = 0; guard < 40; guard++) {
    const issues = findMissingListKeys([{ path: "f.tsx", content }]);
    if (issues.length === 0) break;
    const next = insertOneMapKey(content);
    if (next === content) break;
    content = next;
  }
  return content;
}

function insertOneMapKey(src: string): string {
  for (const m of src.matchAll(/\.map\s*\(/g)) {
    const from = m.index! + m[0].length;
    const arrow = src.indexOf("=>", from);
    if (arrow < 0 || arrow - from > 160) continue;
    const after = src.slice(arrow + 2, arrow + 400);
    const open = after.match(/^([\s(){]*)<([A-Za-z][\w.]*)\b([^>]*)>/);
    if (!open) continue;
    if (/\bkey\s*=/.test(open[3]!)) continue;

    const params = src.slice(from, arrow);
    let withIndex = src;
    let keyExpr = "i";
    if (!/,/.test(params)) {
      const paren = params.match(/^\s*\(\s*([^)]+?)\s*\)\s*$/);
      const bare = params.match(/^\s*([A-Za-z_$][\w$]*)\s*$/);
      if (paren) {
        withIndex = `${src.slice(0, from)}(${paren[1]}, i) ${src.slice(arrow)}`;
      } else if (bare) {
        withIndex = `${src.slice(0, from)}(${bare[1]}, i) ${src.slice(arrow)}`;
      } else {
        continue;
      }
    } else {
      const second = params.split(",").map((part) => part.trim())[1]?.replace(/[):].*$/, "").trim();
      if (second) keyExpr = second.split(":")[0]!.trim() || "i";
    }

    const newArrow = withIndex.indexOf("=>", from);
    if (newArrow < 0) continue;
    const tagStart = withIndex.indexOf(`<${open[2]}`, newArrow);
    if (tagStart < 0) continue;
    const insertAt = tagStart + 1 + open[2]!.length;
    return `${withIndex.slice(0, insertAt)} key={${keyExpr}}${withIndex.slice(insertAt)}`;
  }
  return src;
}

export function findJsxPreviewDefects(files: JsxFile[]): JsxDefect[] {
  return [
    ...findJsxHtmlAttributeDefects(files),
    ...findMissingListKeys(files).map((item) => ({
      path: item.path,
      line: item.line,
      formatted: item.formatted,
    })),
  ];
}

export function repairJsxPreviewDefects<T extends JsxFile>(files: T[]): { files: T[]; changedPaths: string[] } {
  const changed = new Set<string>();
  let out = files.map((file) => {
    if (typeof file.path !== "string" || typeof file.content !== "string") return file;
    if (!/\.(tsx|jsx)$/i.test(file.path)) return file;
    const rewritten = rewriteJsxHtmlAttributes(file.content);
    if (rewritten.content === file.content) return file;
    changed.add(file.path);
    return { ...file, content: rewritten.content };
  });
  const keys = repairMissingListKeys(out);
  for (const path of keys.changedPaths) changed.add(path);
  out = keys.files;
  return { files: out, changedPaths: [...changed] };
}
