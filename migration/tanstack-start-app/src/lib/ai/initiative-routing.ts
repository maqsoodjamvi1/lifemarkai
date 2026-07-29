/**
 * Should this request go to the 11-role initiative orchestrator instead of a
 * normal build?
 *
 * CONTEXT. `editor-lenses/orchestrator.ts` implements discovery → planning →
 * debate → waves → verification across 11 roles, with checkpoints, autonomy
 * gates and a credit budget. It is the most capable generation path in the
 * codebase and today it is reachable ONLY from the Editor Intelligence side
 * panel (`/api/editor-intelligence/initiative`), so no normal build ever uses it.
 *
 * WHY THIS IS A SUGGESTION AND NOT AN AUTO-ROUTE. An initiative runs many role
 * calls across multiple waves; a build runs one generation plus at most a repair
 * pass. Silently promoting a build to an initiative could multiply a user's
 * credit spend on a single message. Everything about that failure mode — costly,
 * invisible, triggered by a heuristic — is the pattern this codebase has already
 * been bitten by (a fabricated context block, an entry check that forced an
 * escalation-model repair on every build). So this module only ever RECOMMENDS.
 * The decision to spend belongs to the user, and the caller is expected to
 * surface the recommendation and wait for consent.
 *
 * The env flag defaults OFF, so with no configuration this changes nothing.
 */

export interface InitiativeRecommendation {
  recommend: boolean;
  /** Human-readable justification, shown to the user with the offer. */
  reason: string;
  /** Which signals fired — useful for tuning the heuristic against real usage. */
  signals: string[];
  /** Rough credit ceiling to quote, so the offer is never open-ended. */
  suggestedBudgetCredits: number;
}

/** Multi-feature scope language: "and also", "plus a", numbered lists, "as well as". */
const MULTI_FEATURE = [
  /\band also\b/i,
  /\bas well as\b/i,
  /\bplus\b\s+(a|an|the)\b/i,
  /\balong with\b/i,
  /\bthen\b\s+(add|build|create)\b/i,
];

/** Words that imply a whole subsystem rather than a screen or a tweak. */
const SUBSYSTEM = [
  /\b(admin|dashboard)\s+(panel|area|portal|backend)\b/i,
  /\bauthentication\b|\bauth\s+system\b/i,
  /\b(payments?|checkout|billing|subscriptions?)\b/i,
  /\b(multi[-\s]?tenant|rbac|permissions?\s+system|roles?\s+and\s+permissions?)\b/i,
  /\b(real[-\s]?time|websocket|notifications?\s+system)\b/i,
  /\bmigrat(e|ion)\b.*\b(schema|database)\b/i,
  /\b(end[-\s]?to[-\s]?end|full)\s+(app|application|platform|system)\b/i,
];

/** Requests that are explicitly staged/phased — the orchestrator's sweet spot. */
const PHASED = [
  /\bphase\s*\d/i,
  /\bstep\s*\d.*\bstep\s*\d/is,
  /\bmilestone\b/i,
  /\broadmap\b/i,
  /\bepics?\b/i,
];

/** Numbered or bulleted requirement lists of length >= 3. */
function listItemCount(prompt: string): number {
  const numbered = prompt.match(/^\s*\d+[.)]\s+\S/gm)?.length ?? 0;
  const bulleted = prompt.match(/^\s*[-*•]\s+\S/gm)?.length ?? 0;
  return Math.max(numbered, bulleted);
}

/**
 * Deliberately conservative: the cheap path must remain the default. A request
 * has to look genuinely multi-part before we even ASK about spending more.
 */
export function recommendInitiative(
  prompt: string,
  opts: { fileCount?: number; mode?: string } = {},
): InitiativeRecommendation {
  const none: InitiativeRecommendation = {
    recommend: false,
    reason: "",
    signals: [],
    suggestedBudgetCredits: 0,
  };

  // Only full builds are candidates. Patches, chat and plan stay as they are —
  // promoting a surgical edit to an initiative would be absurd.
  const mode = opts.mode ?? "build";
  if (mode !== "build" && mode !== "agent") return none;

  const text = (prompt ?? "").trim();
  if (text.length < 180) return none; // short asks are never initiatives

  const signals: string[] = [];
  const items = listItemCount(text);
  if (items >= 3) signals.push(`${items} explicit requirements listed`);
  if (MULTI_FEATURE.some((r) => r.test(text))) signals.push("multiple features in one request");
  const subsystems = SUBSYSTEM.filter((r) => r.test(text)).length;
  if (subsystems >= 2) signals.push(`${subsystems} distinct subsystems mentioned`);
  if (PHASED.some((r) => r.test(text))) signals.push("request is explicitly phased");
  if (text.length >= 900) signals.push("very long specification");

  // Two independent signals minimum. One is far too easy to trip — a long
  // paragraph about a single page would otherwise qualify.
  if (signals.length < 2) return none;

  // Budget scales with apparent scope but is always bounded, so the offer we
  // show the user is a ceiling rather than an open tab.
  const base = 12;
  const perSignal = 6;
  const fileBump = Math.min(12, Math.floor((opts.fileCount ?? 0) / 15));
  const suggestedBudgetCredits = Math.min(60, base + signals.length * perSignal + fileBump);

  return {
    recommend: true,
    reason:
      "This looks like a multi-part build rather than a single change. The engineering-team mode plans it into epics, has specialist roles review each other, and verifies between waves — it produces better results on work this size, but costs more than a normal build.",
    signals,
    suggestedBudgetCredits,
  };
}

/**
 * Master switch. Default OFF: with no env configuration the platform behaves
 * exactly as before and no user is ever shown the offer.
 */
export function initiativeRoutingEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const v = process.env.ENABLE_INITIATIVE_SUGGESTIONS;
  return v === "1" || v === "true";
}
