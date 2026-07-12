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
  return [...files]
    .filter((file) => CODE_FILE_RE.test(file.path) && !LOW_VALUE_PATH_RE.test(file.path))
    .map((file) => ({ file, score: scoreTextEditFile(file, intent) }))
    .filter(({ file, score }) => score > 0 && !!findTextOccurrence(file.content, intent.from))
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
