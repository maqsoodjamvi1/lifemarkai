/**
 * Deterministic copy/text edit fallback for tiny prompts such as
 * "update Tech to Technology in hero section".
 */

export type ProjectFileLike = { path: string; content: string };

type TextReplacementIntent = {
  from: string;
  to: string;
  scope?: string;
};

const CODE_FILE_RE = /\.(tsx|jsx|ts|js|html|vue|svelte|mdx?)$/i;
const LOW_VALUE_PATH_RE = /(^|\/)(package-lock|pnpm-lock|yarn\.lock|node_modules|dist|build)\b/i;

export function parseTextReplacementIntent(prompt: string): TextReplacementIntent | null {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  const match = trimmed.match(
    /\b(?:update|change|replace|rename)\s+(.+?)\s+(?:to|with)\s+(.+?)(?:\s+(?:in|on|inside)\s+(.+))?$/i,
  );
  if (!match) return null;

  const from = cleanTextToken(match[1] ?? "");
  const to = cleanTextToken(match[2] ?? "");
  const scope = cleanScope(match[3] ?? "");
  if (!from || !to || from.toLowerCase() === to.toLowerCase()) return null;
  if (from.length > 80 || to.length > 120) return null;
  return { from, to, scope };
}

export function buildDeterministicTextPatches(
  prompt: string,
  files: ProjectFileLike[],
): Array<{ path: string; find: string; replace: string; description: string }> {
  const intent = parseTextReplacementIntent(prompt);
  if (!intent) return [];

  // "change the hero heading to \"X\"" — FROM is an element DESCRIPTOR, not
  // literal copy. Searching files for the literal string "the hero heading"
  // can never hit; patch the scoped component's top heading directly instead.
  const descriptor = parseHeadingDescriptor(intent.from);
  if (descriptor) {
    const patch = buildHeadingReplacementPatch(descriptor.scope, intent.to, files);
    return patch ? [patch] : [];
  }

  const candidates = rankTextEditFiles(files, intent);
  for (const file of candidates) {
    const hit = findTextOccurrence(file.content, intent.from);
    if (!hit) continue;
    return [{
      path: file.path,
      find: hit,
      replace: preserveCase(intent.to, hit),
      description: `Replace ${intent.from} with ${intent.to}`,
    }];
  }
  return [];
}

/**
 * Files never imported anywhere and not entry/page/route files are ORPHANS —
 * patching them changes nothing on screen. Observed live: the model edited an
 * unused src/components/Hero.tsx while the real hero lived inline in
 * src/pages/Home.tsx, so the "successful" edit was invisible.
 * Import detection is heuristic (directory index re-exports resolve by
 * basename), so callers should DEPRIORITIZE orphans, not hard-exclude them.
 */
export function findReachablePaths(files: ProjectFileLike[]): Set<string> {
  const imported = new Set<string>();
  const importRe = /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']/g;
  for (const f of files) {
    let m: RegExpExecArray | null;
    importRe.lastIndex = 0;
    while ((m = importRe.exec(f.content || "")) !== null) {
      const spec = (m[1] || m[2] || m[3] || "").replace(/\.(tsx|ts|jsx|js|vue|svelte)$/i, "");
      const base = spec.split("/").pop();
      if (base) imported.add(base.toLowerCase());
    }
  }
  const reachable = new Set<string>();
  for (const f of files) {
    const p = f.path.replace(/\\/g, "/");
    const base = (p.split("/").pop() ?? "")
      .replace(/\.(tsx|ts|jsx|js|vue|svelte)$/i, "")
      .toLowerCase();
    const isEntryOrPage =
      /(^|\/)(pages|app|routes|views)\//i.test(p) ||
      /(^|\/)(app|index|main)\.(tsx|jsx|ts|js|vue|svelte)$/i.test(p) ||
      /\.html?$/i.test(p);
    if (isEntryOrPage || imported.has(base)) reachable.add(f.path);
  }
  // Degenerate case (no entry files, no detectable imports — tiny scaffolds or
  // heuristic failure): don't mark the whole project orphaned.
  if (reachable.size === 0) return new Set(files.map((f) => f.path));
  return reachable;
}

/** "the hero heading" / "main headline" / "page title" → element descriptor. */
const HEADING_DESCRIPTOR_RE =
  /^(?:the\s+)?(?:main\s+|big\s+|top\s+)?([a-z][a-z-]*\s+)?(?:heading|headline|title|h1)$/i;
const HEADING_SCOPE_RE = /^(hero|header|main|home|landing|page|banner|hero-section)$/;

export function parseHeadingDescriptor(from: string): { scope?: string } | null {
  const m = from.trim().match(HEADING_DESCRIPTOR_RE);
  if (!m) return null;
  const scope = m[1]?.trim().toLowerCase();
  if (scope && !HEADING_SCOPE_RE.test(scope)) return null;
  return { scope };
}

/**
 * Ranked candidate FILES for a heading-descriptor edit. Unlike the deterministic
 * patcher, STRUCTURED headings are included — the model repair pass can rewrite
 * gradient-span heroes that plain find/replace can't. Used to OVERRIDE the
 * model's own (often poisoned) target choice in the repair prompt.
 */
export function pickHeadingCandidateFiles(
  files: ProjectFileLike[],
  scope?: string,
): ProjectFileLike[] {
  const reachable = findReachablePaths(files);
  return [...files]
    .filter((f) => CODE_FILE_RE.test(f.path) && !LOW_VALUE_PATH_RE.test(f.path))
    .map((file) => {
      const path = file.path.replace(/\\/g, "/").toLowerCase();
      const m = file.content.match(/<((?:\w+\.)?h1)\b[^>]*>([\s\S]*?)<\/\1>/i);
      let score = m ? 30 : 0;
      if (scope && path.includes(scope)) score += 200;
      if (m && /(^|\/)(pages|views)\/(home|index|landing|main)/i.test(path)) score += 120;
      if (m && /(home|index|landing|hero)/i.test(path)) score += 40;
      if (!reachable.has(file.path)) score -= 250;
      return { file, score };
    })
    .filter((c) => c.score >= 100)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((c) => c.file);
}

/**
 * Find the scoped component's <h1> and swap its inner text. Only fires when the
 * heading's inner content is PLAIN TEXT — structured headings (gradient spans,
 * nested markup) are left to the model repair pass, which preserves styling.
 */
function buildHeadingReplacementPatch(
  scope: string | undefined,
  to: string,
  files: ProjectFileLike[],
): { path: string; find: string; replace: string; description: string } | null {
  const reachable = findReachablePaths(files);
  const candidates = [...files]
    .filter((f) => CODE_FILE_RE.test(f.path) && !LOW_VALUE_PATH_RE.test(f.path))
    .map((file) => {
      const path = file.path.replace(/\\/g, "/").toLowerCase();
      // Match plain <h1> AND animated variants (<motion.h1> etc.).
      const m = file.content.match(/<((?:\w+\.)?h1)\b[^>]*>([\s\S]*?)<\/\1>/i);
      let score = m ? 30 : 0;
      if (scope && path.includes(scope.replace(/-/g, ""))) score += 100;
      if (scope && path.includes(scope)) score += 100;
      // A HOME/LANDING page's own h1 IS the "hero" heading even when the
      // filename doesn't say so — but arbitrary pages (OrderSuccess, About…)
      // are NOT: their h1 hijacking the hero edit patched the wrong screen.
      if (scope && m && /(^|\/)(pages|views)\/(home|index|landing|main)/i.test(path)) score += 100;
      if (m && /(home|index|landing)/i.test(path)) score += 30;
      if (!scope && /(hero|header|home|landing|index|app|page)/.test(path)) score += 20;
      // Orphan components render nowhere — a scope match on an unused file must
      // lose to a rendered page containing the actual heading.
      if (!reachable.has(file.path)) score -= 250;
      return { file, m, score };
    })
    .filter((c): c is typeof c & { m: RegExpMatchArray } => c.m !== null)
    // A named scope ("hero", "header"…) must only ever patch a scope-matching
    // file — silently editing some OTHER component's h1 is worse than falling
    // back to the model repair pass.
    .filter((c) => (scope ? c.score >= 100 : true))
    .sort((a, b) => b.score - a.score);

  // Only the TOP-RANKED candidate tier may be patched. Cascading to a lower-
  // ranked file when the best match has a structured heading patched the WRONG
  // page (observed: Home's gradient hero skipped → OrderSuccess's plain h1 got
  // the hero text). If the best candidates aren't safely patchable, defer to
  // the model repair pass, which sees full file content.
  const topScore = candidates[0]?.score ?? 0;
  for (const c of candidates) {
    if (c.score < topScore - 25) break;
    const inner = c.m[2] ?? "";
    if (!inner.trim()) continue; // empty heading — nothing safe to anchor on
    if (/[<>{}]/.test(inner)) continue; // structured (spans/JSX) — model handles it
    const find = c.m[0];
    return {
      path: c.file.path,
      find,
      replace: find.replace(inner, to),
      description: `Replace heading "${inner.trim()}" with "${to}"`,
    };
  }
  return null;
}

function cleanTextToken(value: string): string {
  return value
    .trim()
    .replace(/^["'`“”‘’]+|["'`“”‘’.,!?]+$/g, "")
    .trim();
}

function cleanScope(value: string): string | undefined {
  const cleaned = value
    .trim()
    .replace(/^the\s+/i, "")
    .replace(/\s+(section|area|component|text|copy)$/i, "")
    .replace(/[.,!?]+$/g, "")
    .trim();
  return cleaned || undefined;
}

function rankTextEditFiles(files: ProjectFileLike[], intent: TextReplacementIntent): ProjectFileLike[] {
  const reachable = findReachablePaths(files);
  return [...files]
    .filter((file) => CODE_FILE_RE.test(file.path) && !LOW_VALUE_PATH_RE.test(file.path))
    .map((file) => ({
      file,
      // Rendered files first — literal text often exists in BOTH a live page and
      // an orphaned duplicate component; patch the one users can see.
      score: scoreTextEditFile(file, intent) + (reachable.has(file.path) ? 0 : -250),
    }))
    .filter(({ file, score }) => score > -200 && !!findTextOccurrence(file.content, intent.from))
    .sort((a, b) => b.score - a.score)
    .map(({ file }) => file);
}

function scoreTextEditFile(file: ProjectFileLike, intent: TextReplacementIntent): number {
  const path = file.path.replace(/\\/g, "/").toLowerCase();
  const content = file.content ?? "";
  let score = 1;
  if (/(^|\/)(app|page|home|landing|index)\.(tsx|jsx|ts|js|html|mdx?)$/i.test(path)) score += 20;
  if (/\/components\//i.test(path)) score += 10;
  if (/<(main|section|header|h1|h2|p)\b/i.test(content)) score += 10;

  const scope = intent.scope?.toLowerCase() ?? "";
  if (scope) {
    if (path.includes(scope.replace(/\s+/g, "-")) || path.includes(scope.replace(/\s+/g, ""))) score += 60;
    if (new RegExp(`\\b${escapeRegExp(scope)}\\b`, "i").test(content)) score += 40;
    if (scope.includes("hero") && (path.includes("hero") || /\bHero\b|hero-/i.test(content))) score += 80;
    if (scope.includes("header") && (path.includes("header") || /<header\b/i.test(content))) score += 70;
    if (scope.includes("footer") && (path.includes("footer") || /<footer\b/i.test(content))) score += 70;
  }

  if (content.length > 60_000) score -= 10;
  return score;
}

function findTextOccurrence(content: string, needle: string): string | null {
  if (!needle) return null;
  if (content.includes(needle)) return needle;

  const wordLike = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(needle);
  const escaped = escapeRegExp(needle).replace(/\s+/g, "\\s+");
  const re = new RegExp(wordLike ? `\\b${escaped}\\b` : escaped, "i");
  const match = content.match(re);
  return match?.[0] ?? null;
}

function preserveCase(next: string, previous: string): string {
  if (previous.toUpperCase() === previous) return next.toUpperCase();
  if (previous[0]?.toUpperCase() === previous[0] && previous.slice(1).toLowerCase() === previous.slice(1)) {
    return next.charAt(0).toUpperCase() + next.slice(1);
  }
  return next;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
