/**
 * Refuse a generated file write that is obviously worse than what it replaces.
 *
 * WHY THIS EXISTS. Two code paths take a model's response and write it straight
 * over a project file with no validation: the preview auto-fix (`http/fix.ts`)
 * and the post-build self-verify loop (`self-verify.ts`). Both are triggered BY
 * a broken preview, which makes them a ratchet rather than a repair: a bad write
 * breaks the preview, the broken preview triggers another fix, that fix is
 * handed the already-damaged file as context, and the damage compounds. Every
 * downstream repair helper (`align-package-json`, `npm-auto-install`,
 * `patch-sandbox-preview-files`, `cloud/auto-wire`) opens with a `JSON.parse`
 * inside a `try` and silently bails on malformed input, so once a file is
 * corrupt it is invisible to the machinery that could have healed it.
 *
 * Both failure modes below were observed in production on one project in one
 * evening:
 *
 *   1. `package.json` reached 5832 bytes — exactly three byte-identical copies
 *      of the same 1944-byte document, concatenated with no separator. It grew
 *      by one copy per turn. npm could not parse it, so `npm run dev` died on
 *      startup, the sandbox supervisor restarted it about once a second, vite
 *      never bound its port, and the preview served 502 forever.
 *
 *   2. A correct root route was rewritten to import `Html`, `Head` and `Body`
 *      from `@tanstack/react-router` — an API removed before 1.0, on a project
 *      pinned to 1.170 — replacing the `HeadContent`/`Scripts` shell that had
 *      been working minutes earlier.
 *
 * WHAT THIS DOES AND DOES NOT CATCH. Be honest about the boundary: this is a
 * cheap structural gate, not a compiler. It catches (1) outright, and it catches
 * the common shape of (2) — a rewrite that drops an import while still using the
 * symbol. It does NOT catch (2) as it actually happened, because that write was
 * internally consistent: it imported the symbols it used, and only a resolver
 * with the project's real `node_modules` could know those exports no longer
 * exist. Closing that gap needs verify-then-keep (write, re-probe the preview,
 * roll back if a NEW error appears), which is a bigger change than this file.
 *
 * The bar for every rule here is: a false positive costs one skipped auto-fix
 * turn, which the user can retry. A false negative costs a project. So each rule
 * only fires on something that is never a legitimate edit.
 */

export interface GuardVerdict {
  /** Safe to persist? */
  ok: boolean;
  /** Stable slug for logs/metrics. Absent when ok. */
  code?:
    | "empty-overwrite"
    | "invalid-json"
    | "duplicated-content"
    | "undefined-component";
  /** One line, safe to surface to a user or a log. Absent when ok. */
  reason?: string;
}

const OK: GuardVerdict = { ok: true };

/**
 * Smallest repeating unit we will call "duplicated".
 *
 * A short file can legitimately be its own repetition — `"a\n".repeat(3)` is a
 * fine three-line file, and a CSS reset could plausibly repeat a short block.
 * Requiring a substantial unit keeps the rule to the case it is for: a whole
 * document accidentally emitted more than once.
 */
const MIN_REPEAT_UNIT = 120;

/** How many whole copies we bother looking for. Three was observed; six is slack. */
const MAX_REPEAT_FACTOR = 6;

function isJsonPath(path: string): boolean {
  return /\.jsonc?$/i.test(path.trim());
}

/**
 * Not every `.json` file is JSON.
 *
 * `tsconfig.json` and friends are JSONC: TypeScript, VS Code and esbuild all
 * accept comments and trailing commas there, and this repo's own tsconfig uses
 * them. A strict parse rejected it, which would have blocked every legitimate
 * tsconfig edit. Rather than special-casing filenames — a generated project can
 * name a JSONC file anything — tolerate both dialects and only fail on input
 * that is not valid under either.
 */
function stripJsonComments(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      out += c;
      i++;
      while (i < n) {
        out += text[i];
        if (text[i] === "\\") {
          i++;
          if (i < n) out += text[i];
          i++;
          continue;
        }
        if (text[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  // Trailing commas before a closing brace/bracket.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Does `text` parse as JSON, allowing the JSONC dialect? */
function parsesAsJson(text: string): { ok: true } | { ok: false; message: string } {
  try {
    JSON.parse(text);
    return { ok: true };
  } catch (strictErr) {
    try {
      JSON.parse(stripJsonComments(text));
      return { ok: true };
    } catch {
      return {
        ok: false,
        message:
          strictErr instanceof Error ? strictErr.message : String(strictErr),
      };
    }
  }
}

/**
 * Is `text` exactly the same chunk repeated two or more times, end to end?
 *
 * Checked on the raw string with no separator allowance, because that is the
 * observed shape: the seam in the real corruption was a bare `}{`, and the total
 * length divided evenly by three. A newline-joined repetition would not divide
 * evenly and is not what this rule is for.
 */
export function repeatedCopies(text: string): number {
  const n = text.length;
  if (n < MIN_REPEAT_UNIT * 2) return 1;
  for (let factor = 2; factor <= MAX_REPEAT_FACTOR; factor++) {
    if (n % factor !== 0) continue;
    const unit = n / factor;
    if (unit < MIN_REPEAT_UNIT) continue;
    const head = text.slice(0, unit);
    let all = true;
    for (let i = 1; i < factor; i++) {
      if (text.slice(i * unit, (i + 1) * unit) !== head) {
        all = false;
        break;
      }
    }
    if (all) return factor;
  }
  return 1;
}

/**
 * Blank out string literals, template literals and comments.
 *
 * The JSX rule below scans for `<Name`, and a `<Foo />` inside a doc comment or
 * a string is not a real usage. This is a lexer's worth of care, not a parser's:
 * it only has to be good enough that the rule does not fire on prose.
 */
function stripLiteralsAndComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;

  /**
   * Could a `/` here begin a regex literal rather than a division?
   *
   * This matters more than it looks. A regex can contain quote characters —
   * `/from ['"]next\/image['"]/i` is real code in this repo — and without this
   * check the scanner reads that `'` as the start of a string, consumes past
   * the real code after it, and every string literal from there on is treated
   * as source. That desync is what made a `<Image>` mentioned inside a prompt
   * string look like a JSX tag.
   *
   * The usual heuristic: a regex can only start where a VALUE is expected, so
   * look back at the last meaningful character.
   */
  const regexCanStart = (): boolean => {
    for (let k = out.length - 1; k >= 0; k--) {
      const ch = out[k];
      if (/\s/.test(ch)) continue;
      if ("(,=:[!&|?{};+-*%~^<>".includes(ch)) return true;
      // `return /re/`, `typeof /re/` … — a keyword ending right here.
      return /\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/.test(
        out.slice(0, k + 1),
      );
    }
    return true; // start of file
  };

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    if (c === "/" && next !== "/" && next !== "*" && regexCanStart()) {
      // Consume a regex literal, honouring escapes and `[...]` classes (where
      // an unescaped `/` is legal and does NOT close the literal).
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n) {
        const rc = src[j];
        if (rc === "\\") {
          j += 2;
          continue;
        }
        if (rc === "\n") break; // unterminated — not a regex after all
        if (rc === "[") inClass = true;
        else if (rc === "]") inClass = false;
        else if (rc === "/" && !inClass) {
          closed = true;
          j++;
          break;
        }
        j++;
      }
      if (closed) {
        while (j < n && /[a-z]/.test(src[j])) j++; // flags
        out += " ";
        i = j;
        continue;
      }
      // Fall through: it was division after all.
    }

    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      out += " ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Every `<Name` / `</Name` tag occurrence, with the index of the NAME itself.
 *
 * The leading character is load-bearing. Without excluding it this reads every
 * TYPE ARGUMENT as a JSX tag — `useRef<HTMLDivElement>(null)`,
 * `useState<RangeKey>()`, `Array<Skill>` — and a sweep of this repo flagged 114
 * of 848 healthy files. A generic's `<` always follows an identifier, `)` or
 * `]`; a JSX tag's `<` never does.
 *
 * Uppercase-initial only: lowercase is an intrinsic HTML element, and
 * `<Foo.Bar>` resolves through `Foo`, so only the head segment matters.
 */
function tagOccurrences(code: string): Array<{ name: string; at: number }> {
  const out: Array<{ name: string; at: number }> = [];
  for (const m of code.matchAll(
    /(?:^|[^A-Za-z0-9_$)\]])(<\/?)([A-Z][\w$]*)(?:\.[\w$]+)*[\s/>]/g,
  )) {
    out.push({ name: m[2], at: m.index! + m[0].indexOf(m[1]) + m[1].length });
  }
  return out;
}

/**
 * JSX components that appear NOWHERE in the module except as a tag.
 *
 * The earlier version of this parsed `import` clauses and `const`/`function`
 * declarations to build a scope set. It was both fiddly and wrong: it missed
 * destructuring renames, so the extremely common `{items.map(({ icon: Icon }) =>
 * <Icon />)}` looked like an undefined component, and it missed generic type
 * annotations like `const f: <T>(x: T) => T`. Twelve healthy files in this repo
 * tripped it.
 *
 * "Mentioned only as a tag" is a weaker claim but a sounder one, and it still
 * catches the case this rule exists for. When a rewrite drops an import and
 * keeps the usage, the deleted import line was the symbol's only other mention
 * — so the name is left appearing exactly once, in tag position. Anything that
 * binds the name by any means at all (import, declaration, destructure, alias,
 * parameter) leaves a second mention behind and is trusted.
 */
export function undefinedComponents(src: string): string[] {
  const code = stripLiteralsAndComments(src);
  const tags = tagOccurrences(code);
  if (tags.length === 0) return [];

  const tagIndices = new Map<string, Set<number>>();
  for (const { name, at } of tags) {
    if (!tagIndices.has(name)) tagIndices.set(name, new Set());
    tagIndices.get(name)!.add(at);
  }

  const missing: string[] = [];
  for (const [name, indices] of tagIndices) {
    const word = new RegExp(`\\b${name}\\b`, "g");
    let boundElsewhere = false;
    for (const m of code.matchAll(word)) {
      if (!indices.has(m.index!)) {
        boundElsewhere = true;
        break;
      }
    }
    if (!boundElsewhere) missing.push(name);
  }
  return missing.sort();
}

/**
 * Should this generated write be allowed to replace `previous`?
 *
 * `previous` is the content currently stored for the path — omit it for a file
 * being created, which relaxes the rules that only make sense as a comparison.
 */
export function guardFileWrite(args: {
  path: string;
  next: string | null | undefined;
  previous?: string | null;
}): GuardVerdict {
  const path = String(args.path ?? "");
  const next = args.next ?? "";
  const previous = args.previous ?? "";

  // 1. Never blank a file that had content. An auto-fix that produces nothing
  //    is a parse failure upstream, not an edit.
  if (!next.trim() && previous.trim()) {
    return {
      ok: false,
      code: "empty-overwrite",
      reason: `refused to blank ${path} (${previous.length} bytes) with an empty write`,
    };
  }

  // 2. Unparseable JSON is never a legitimate edit, whatever the old content
  //    was. This is the single check that would have contained the observed
  //    package.json failure at its first occurrence.
  if (isJsonPath(path) && next.trim()) {
    const parsed = parsesAsJson(next);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "invalid-json",
        reason: `refused to write unparseable JSON to ${path}: ${parsed.message}`,
      };
    }
  }

  // 3. A document emitted N times over. Checked even when rule 2 passed, since
  //    a duplicated non-JSON file (a component written twice) is equally wrong
  //    and equally never intended.
  const copies = repeatedCopies(next);
  if (copies > 1) {
    return {
      ok: false,
      code: "duplicated-content",
      reason: `refused to write ${path}: content is the same ${Math.round(
        next.length / copies,
      )}-byte document repeated ${copies} times`,
    };
  }

  // 4. The growth shape of the observed ratchet: the new content is the old
  //    content with at least one more whole copy appended. Rule 3 misses this
  //    once the file has picked up an odd trailing edit, so check it directly.
  if (
    previous.length >= MIN_REPEAT_UNIT &&
    next.length >= previous.length * 2 &&
    next.startsWith(previous)
  ) {
    return {
      ok: false,
      code: "duplicated-content",
      reason: `refused to write ${path}: new content begins with the entire ${previous.length}-byte previous version and is ${next.length} bytes`,
    };
  }

  // 5. A component used but never imported or declared cannot render — this is
  //    the "rewrote the file and dropped an import" shape. Only applied to JSX
  //    modules that import at least one thing, so a plain snippet with no
  //    imports is not second-guessed.
  if (/\.(tsx|jsx)$/i.test(path) && /\bimport\b/.test(next)) {
    const missing = undefinedComponents(next);
    if (missing.length > 0) {
      return {
        ok: false,
        code: "undefined-component",
        reason: `refused to write ${path}: uses <${missing.join(">, <")}> without importing or declaring ${
          missing.length === 1 ? "it" : "them"
        }`,
      };
    }
  }

  return OK;
}
