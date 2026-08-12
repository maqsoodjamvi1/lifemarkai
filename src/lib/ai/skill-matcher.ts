/**
 * Skill auto-matcher.
 *
 * Lovable attaches a skill whenever the user's prompt semantically matches
 * its description, so users don't need to type the exact name. This module
 * does the same in a deliberately cheap way: no embeddings call, no external
 * service — a single regex-based tokenizer + a weighted overlap score across
 * the skill's name, tags, and description.
 *
 * The scoring is calibrated so a typical skill with a focused description
 * fires when the prompt contains 2-3 of its salient terms. Stopwords are
 * stripped to avoid spurious matches on "a", "the", "please", etc.
 *
 * Usage from app/api/ai/chat/route.ts:
 *
 *   import { matchSkills } from "@/lib/ai/skill-matcher";
 *
 *   const candidates = await loadWorkspaceSkills(userId);  // existing
 *   const matches    = matchSkills(userMessage, candidates, { topN: 2 });
 *   if (matches.length) {
 *     systemPrompt += renderSkillBlock(matches);
 *   }
 *
 * The returned `score` is in [0, 1] and is intentionally easy to inspect.
 */

export interface SkillCandidate {
  id: string;
  name: string;
  description?: string | null;
  prompt: string;
  tags?: string[] | null;
}

export interface SkillMatch {
  skill: SkillCandidate;
  score: number;
  /** Why we matched — useful for debugging and the "using skill: X" chip. */
  reason: string;
}

export interface MatchOptions {
  /** Minimum score to accept a match. Default 0.14 — calibrated empirically. */
  threshold?: number;
  /** Max number of skills to return, in descending score order. Default 2. */
  topN?: number;
}

// Conservative English stopword list. We intentionally do NOT strip verbs like
// "add", "create", "make" — those are highly informative for matching skills.
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has",
  "have", "i", "in", "is", "it", "its", "me", "my", "of", "on", "or", "our",
  "please", "so", "that", "the", "their", "them", "they", "this", "to", "us",
  "was", "we", "were", "what", "when", "where", "which", "who", "why", "will",
  "with", "you", "your", "yours", "can", "could", "would", "should", "may",
  "might", "do", "does", "did", "if", "then", "than", "also", "just", "very",
  "too", "any", "some", "all", "no", "not", "yes",
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ") // keep letters, numbers, apostrophes, hyphens
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Convert a tokenized list into a set (de-duped). */
function tokenSet(tokens: string[]): Set<string> {
  return new Set(tokens);
}

/**
 * Compute a single skill's match score for a user prompt.
 *
 * The score blends three signals:
 *   • name overlap     — strongest. If the skill's name terms appear in the
 *                        prompt, that's a high-confidence signal.
 *   • description sim  — Jaccard similarity of the prompt and description
 *                        token sets.
 *   • tag hit          — boost when any tag appears as a whole word in the
 *                        prompt. Tags are typically short and salient.
 *
 * Weighting (name 0.5 / description 0.35 / tag 0.15) was picked so that a
 * skill matches on either (a) name AND any one other signal, OR (b) several
 * distinctive description terms even without a name hit.
 */
export function scoreSkill(prompt: string, skill: SkillCandidate): { score: number; reason: string } {
  const promptTokens = tokenSet(tokenize(prompt));
  if (promptTokens.size === 0) return { score: 0, reason: "empty prompt" };

  // ── Name overlap ──────────────────────────────────────────────────────────
  const nameTokens = tokenize(skill.name);
  const nameHits = nameTokens.filter((t) => promptTokens.has(t)).length;
  const nameScore = nameTokens.length > 0 ? nameHits / nameTokens.length : 0;

  // ── Description Jaccard ───────────────────────────────────────────────────
  const descTokens = tokenSet(tokenize(skill.description ?? ""));
  let descScore = 0;
  if (descTokens.size > 0) {
    let intersect = 0;
    for (const t of descTokens) if (promptTokens.has(t)) intersect++;
    const union = promptTokens.size + descTokens.size - intersect;
    descScore = union > 0 ? intersect / union : 0;
  }

  // ── Tag hit ───────────────────────────────────────────────────────────────
  const tags = (skill.tags ?? []).map((t) => t.toLowerCase());
  const tagHits = tags.filter((t) => promptTokens.has(t)).length;
  const tagScore = tags.length > 0 ? Math.min(1, tagHits / Math.max(1, tags.length)) : 0;

  // Weights: name is the strongest single signal, then description Jaccard,
  // then tag bag-of-words. Tags get a meaningful share (0.25) because users
  // hand-curate them — when a tag fires, it's almost always intentional.
  const score = 0.45 * nameScore + 0.30 * descScore + 0.25 * tagScore;

  const reasons: string[] = [];
  if (nameHits > 0) reasons.push(`${nameHits} name word${nameHits > 1 ? "s" : ""}`);
  if (descScore > 0) reasons.push(`${Math.round(descScore * 100)}% description overlap`);
  if (tagHits > 0) reasons.push(`${tagHits} tag${tagHits > 1 ? "s" : ""}`);

  return { score, reason: reasons.join(", ") || "no overlap" };
}

/**
 * Pick the best-matching skills for a prompt.
 *
 * Returns at most `topN` matches with score >= `threshold`, sorted by score
 * descending. Ties are broken by skill name (alphabetical) so the output is
 * deterministic.
 */
export function matchSkills(
  prompt: string,
  skills: SkillCandidate[],
  opts: MatchOptions = {},
): SkillMatch[] {
  const { threshold = 0.14, topN = 2 } = opts;
  if (!prompt?.trim() || !skills?.length) return [];

  const scored: SkillMatch[] = skills
    .map((skill) => {
      const { score, reason } = scoreSkill(prompt, skill);
      return { skill, score, reason };
    })
    .filter((m) => m.score >= threshold);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.skill.name.localeCompare(b.skill.name);
  });

  return scored.slice(0, topN);
}

/**
 * Render matched skills as a block to append to the chat system prompt.
 *
 * The block is wrapped in clear delimiters so the model treats it as an
 * additional instruction set, and each skill is given a short header with
 * its name + match reason for transparency.
 */
export function renderSkillBlock(matches: SkillMatch[]): string {
  if (matches.length === 0) return "";
  const blocks = matches.map((m) => {
    return [
      `## Skill: ${m.skill.name}`,
      m.skill.description ? `> ${m.skill.description}` : "",
      "",
      m.skill.prompt.trim(),
    ].filter(Boolean).join("\n");
  });
  return [
    "",
    "---",
    "# Auto-attached skills",
    "_These skills were matched to the user's prompt and should guide your response._",
    "",
    blocks.join("\n\n---\n\n"),
    "---",
  ].join("\n");
}
