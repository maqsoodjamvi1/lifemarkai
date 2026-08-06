/**
 * Dependency-free JSX tag-balance checker.
 *
 * WHY THIS EXISTS. The model occasionally emits structurally invalid JSX —
 * the real case that motivated this: an About page closing a plain `<div>`
 * with `</motion.div>`. That single line makes the whole module fail to
 * compile, Vite serves a blank page, and the user reports "preview is blank".
 * The platform's `typescript` package is a devDependency only, so a full
 * parse at runtime in production is not reliable — instead this is a small
 * forward tokenizer that walks the source once and keeps a stack of open
 * JSX tags.
 *
 * WHAT IT FLAGS (and only this):
 *   - `extra_close`  — a `</name>` with no matching `<name>` open anywhere
 *   - `unclosed`     — a `<name>` still open at the point its parent closes,
 *                      or at end of file
 *
 * WHAT IT MUST NEVER FLAG — validated against a corpus of 90 real Lovable
 * export files (0 false positives) plus targeted traps:
 *   - TS generics: `useRef<HTMLDivElement>`, `Map<string, Array<number>>`
 *   - generic arrows: `<T,>(x) => x`, `<T extends U>(x) => x`
 *   - comparisons: `a < b && c > d`, `count < 5 ? … : …`
 *   - void/self-closing elements: `<img …>`, `<br />`, `<input type="x" />`
 *   - fragments `<>…</>`, dotted names `<motion.div>`, multiline attributes,
 *     brace expressions with nested JSX (render props, `.map(… => (<li/>))`)
 *
 * The disambiguation rule for `<` is the one error-tolerant JSX scanners use:
 * it opens a tag only when followed by `/`, `>` or an identifier AND the
 * previous significant token puts us in expression position (after `return`,
 * `(`, `{`, `[`, `,`, `=`, `?`, `:`, `&&`, `||`, `>`…) — after a value
 * (identifier, `)`, `]`) it is a comparison or generic instead.
 */

export interface JsxBalanceIssue {
  kind: "extra_close" | "unclosed";
  name: string;
  /** 1-based line number of the offending tag. */
  line: number;
}

const VOID_ELEMENTS =
  /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/;

const EXPR_KEYWORDS = new Set([
  "return", "default", "case", "do", "else", "in", "typeof", "yield", "await",
]);

export function checkJsxTagBalance(content: string): JsxBalanceIssue[] {
  const issues: Array<{ kind: "extra_close" | "unclosed"; name: string; pos: number }> = [];
  const src = content;
  const n = src.length;

  let i = 0;
  let lastSig = "\n";
  let lastSigWord = "";
  const stack: Array<{ name: string; pos: number }> = [];

  const isIdStart = (c: string) => /[A-Za-z_$]/.test(c);
  const isIdChar = (c: string) => /[A-Za-z0-9_$.\-:]/.test(c);

  function skipString(j: number): number {
    const q = src[j];
    j++;
    while (j < n) {
      if (src[j] === "\\") { j += 2; continue; }
      if (src[j] === q) return j + 1;
      j++;
    }
    return j;
  }

  function skipTemplate(j: number): number {
    j++;
    while (j < n) {
      const c = src[j];
      if (c === "\\") { j += 2; continue; }
      if (c === "`") return j + 1;
      if (c === "$" && src[j + 1] === "{") { j = skipPlainBraces(j + 1); continue; }
      j++;
    }
    return j;
  }

  /** Braces where inner JSX is NOT tracked (template interpolations). */
  function skipPlainBraces(j: number): number {
    let depth = 0;
    while (j < n) {
      const c = src[j];
      if (c === "{") { depth++; j++; continue; }
      if (c === "}") { depth--; j++; if (depth === 0) return j; continue; }
      if (c === '"' || c === "'") { j = skipString(j); continue; }
      if (c === "`") { j = skipTemplate(j); continue; }
      if (c === "/" && src[j + 1] === "/") { while (j < n && src[j] !== "\n") j++; continue; }
      if (c === "/" && src[j + 1] === "*") {
        j += 2;
        while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
        j += 2;
        continue;
      }
      j++;
    }
    return j;
  }

  function exprPos(sig: string, word: string): boolean {
    if (EXPR_KEYWORDS.has(word)) return true;
    if (/[A-Za-z0-9_$)\]]/.test(sig)) return false;
    return true;
  }

  function isTagStart(j: number, sig: string, word: string): boolean {
    const next = src[j + 1];
    if (next === undefined) return false;
    if (next === "/") {
      const c2 = src[j + 2];
      return c2 === ">" || (c2 !== undefined && isIdStart(c2));
    }
    if (next === ">") return exprPos(sig, word);
    if (!isIdStart(next)) return false;
    return exprPos(sig, word);
  }

  function popMatch(name: string, pos: number): void {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].name === name) {
        for (let m = stack.length - 1; m > k; m--) {
          issues.push({ kind: "unclosed", name: stack[m].name || "<>", pos: stack[m].pos });
        }
        stack.length = k;
        return;
      }
    }
    issues.push({ kind: "extra_close", name: name || "<>", pos });
  }

  /** Parse a tag at `<`. Returns index after tag, or -1 for "not a tag". */
  function parseTag(j: number): number {
    const start = j;
    j++;
    let closing = false;
    if (src[j] === "/") { closing = true; j++; }
    if (src[j] === ">") {
      if (closing) popMatch("", start);
      else stack.push({ name: "", pos: start });
      return j + 1;
    }
    let name = "";
    while (j < n && isIdChar(src[j])) { name += src[j]; j++; }
    if (!name) return -1;
    if (!closing) {
      // `<T,>(x) => x` / `<T extends U>(x) => x` are type-parameter lists.
      let k = j;
      if (src[k] === ",") return -1;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === ",") return -1;
      if (src.startsWith("extends", k) && /\s/.test(src[k + 7] ?? "")) return -1;
    }
    if (closing) {
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] !== ">") return -1;
      popMatch(name, start);
      return j + 1;
    }
    while (j < n) {
      const c = src[j];
      if (c === '"' || c === "'") { j = skipString(j); continue; }
      if (c === "`") { j = skipTemplate(j); continue; }
      if (c === "{") { j = scanBracesTracking(j); continue; }
      if (c === "/" && src[j + 1] === ">") return j + 2;
      if (c === ">") {
        if (!VOID_ELEMENTS.test(name)) stack.push({ name, pos: start });
        return j + 1;
      }
      if (c === "<") return -1;
      j++;
    }
    return -1;
  }

  /** Braces in attribute/child position — inner JSX IS tracked. */
  function scanBracesTracking(j: number): number {
    let depth = 0;
    let ls = "{";
    let lsw = "";
    while (j < n) {
      const c = src[j];
      if (c === "{") { depth++; ls = "{"; lsw = ""; j++; continue; }
      if (c === "}") { depth--; j++; ls = "}"; lsw = ""; if (depth === 0) return j; continue; }
      if (c === '"' || c === "'") { j = skipString(j); ls = '"'; lsw = ""; continue; }
      if (c === "`") { j = skipTemplate(j); ls = "`"; lsw = ""; continue; }
      if (c === "/" && src[j + 1] === "/") { while (j < n && src[j] !== "\n") j++; continue; }
      if (c === "/" && src[j + 1] === "*") {
        j += 2;
        while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
        j += 2;
        continue;
      }
      if (c === "<") {
        if (isTagStart(j, ls, lsw)) {
          const before = stack.length;
          const after = parseTag(j);
          if (after !== -1) {
            j = stack.length > before ? scanJsxChildren(after, before) : after;
            ls = ">";
            lsw = "";
            continue;
          }
        }
        j++;
        ls = "<";
        lsw = "";
        continue;
      }
      if (/\s/.test(c)) { j++; continue; }
      if (/[A-Za-z0-9_$]/.test(c)) {
        let w = "";
        while (j < n && /[A-Za-z0-9_$]/.test(src[j])) { w += src[j]; j++; }
        ls = w[w.length - 1];
        lsw = w;
        continue;
      }
      ls = c;
      lsw = "";
      j++;
    }
    return j;
  }

  /** Scan JSX children until the stack returns to targetDepth. */
  function scanJsxChildren(j: number, targetDepth: number): number {
    while (j < n && stack.length > targetDepth) {
      const c = src[j];
      if (c === "{") { j = scanBracesTracking(j); continue; }
      if (c === "<") {
        if (src[j + 1] === "!") { j++; continue; }
        const after = parseTag(j);
        if (after === -1) { j++; continue; }
        j = after;
        continue;
      }
      j++;
    }
    return j;
  }

  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipString(i); lastSig = '"'; lastSigWord = ""; continue; }
    if (c === "`") { i = skipTemplate(i); lastSig = "`"; lastSigWord = ""; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "<") {
      if (isTagStart(i, lastSig, lastSigWord)) {
        const before = stack.length;
        const after = parseTag(i);
        if (after !== -1) {
          i = stack.length > before ? scanJsxChildren(after, before) : after;
          lastSig = ">";
          lastSigWord = "";
          continue;
        }
      }
      lastSig = "<";
      lastSigWord = "";
      i++;
      continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let w = "";
      while (i < n && /[A-Za-z0-9_$]/.test(src[i])) { w += src[i]; i++; }
      lastSig = w[w.length - 1];
      lastSigWord = w;
      continue;
    }
    lastSig = c;
    lastSigWord = "";
    i++;
  }

  for (const t of stack) issues.push({ kind: "unclosed", name: t.name || "<>", pos: t.pos });

  return issues.map((x) => ({
    kind: x.kind,
    name: x.name,
    line: content.slice(0, x.pos).split("\n").length,
  }));
}

/**
 * Unterminated string literals — a raw quote inside a quoted value.
 *
 * WHY. A live ERP build seeded a wholesale catalogue and wrote
 *
 *     name: "19" Server Rack 42U",
 *
 * because 19" is how that product is actually named. In a double-quoted
 * literal the inch mark closes the string, the rest of the line becomes
 * garbage, esbuild fails the whole module, and the preview goes white with
 * only a transform error in the console. Product catalogues are FULL of this:
 * inch marks on racks and monitors, feet on cables, apostrophes in
 * "Chef's Special" inside single quotes.
 *
 * The rule that catches it exactly: a `'` or `"` literal in JS/TS may not
 * contain a raw newline. So if a quote opens and the line ends before a
 * matching close, the literal was terminated early by an unescaped quote.
 * Template literals (backticks) legally span lines and are consumed whole;
 * escapes and comments are skipped.
 *
 * Scoped to .ts/.js on purpose — in .tsx, apostrophes inside JSX TEXT
 * ("It's included") are not string literals at all, and telling the two apart
 * needs the full JSX tokenizer above. Data files are where this bug lives.
 */
/** Keywords after which a `/` begins a regex literal, not a division. */
const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "case", "in", "of", "instanceof", "new", "delete",
  "void", "throw", "do", "else", "yield", "await", "match", "replace",
  "split", "test", "search", "matchAll",
]);

export function findUnterminatedStrings(content: string): number[] {
  const hits: number[] = [];
  const src = content;
  let line = 1;
  // Last significant character and word, for telling a regex literal from
  // division — without this, `/<script[^>]+type=["']…/` in a real Lovable edge
  // function reads as an unterminated string and the file is rejected.
  let lastSig = "\n";
  let lastWord = "";

  const regexAllowed = () =>
    REGEX_PRECEDING_KEYWORDS.has(lastWord) || /[(,=:[!&|?{};\n+\-*%<>~^]/.test(lastSig);

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\n") { line++; lastSig = "\n"; lastWord = ""; continue; }
    if (/\s/.test(c)) continue;
    if (c === "\\") { i++; continue; }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let w = "";
      while (i < src.length && /[A-Za-z0-9_$]/.test(src[i])) { w += src[i]; i++; }
      i--;
      lastSig = w[w.length - 1];
      lastWord = w;
      continue;
    }
    if (c === "`") {
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") i++;
        else if (src[i] === "\n") line++;
        i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      line++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i++;
      lastSig = "/";
      lastWord = "";
      continue;
    }
    if (c === "/" && regexAllowed()) {
      // Regex literal: quotes inside it are ordinary characters. `/` does not
      // terminate the pattern while inside a `[…]` character class.
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < src.length) {
        const d = src[j];
        if (d === "\\") { j += 2; continue; }
        if (d === "\n") break; // regex literals cannot span lines
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) { closed = true; break; }
        j++;
      }
      if (closed) {
        i = j;
        lastSig = "/";
        lastWord = "";
        continue;
      }
      // Not a real regex — fall through and treat as an operator.
      lastSig = "/";
      lastWord = "";
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      const openedAt = line;
      i++;
      let closed = false;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "\n") break;
        if (src[i] === quote) { closed = true; break; }
        i++;
      }
      if (!closed) hits.push(openedAt);
      lastSig = quote;
      lastWord = "";
      continue;
    }
    lastSig = c;
    lastWord = "";
  }
  return hits;
}
