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
 * TWO OUTCOMES. `recommendInitiative` scores the request; `decideInitiativeRouting`
 * (below) turns that score into either an AUTO-ROUTE or an OFFER.
 *
 * The original design only ever offered, reasoning that silently promoting a build
 * to a multi-wave initiative could multiply a user's credit spend on one message,
 * and that "costly, invisible, heuristic-triggered" is a failure mode this codebase
 * has already been bitten by. That caution was right about cost and wrong about
 * consequence: with the offer flag off by default, the best generation path in the
 * product was unreachable for everyone who never opened a side panel.
 *
 * So auto-route exists, and the cost concern is answered by making it bounded and
 * visible rather than by refusing: a stricter signal threshold than the offer, a
 * hard credit ceiling quoted up front, a balance check before committing, a
 * caller-capability requirement so a promoted request can never vanish, and an
 * env kill switch. Every decline records WHY in `declinedBecause`.
 */

/**
 * Hard credit ceiling for one initiative run — the single definition.
 *
 * `/api/editor-intelligence/initiative` imports this and both validates
 * `budgetCredits` against it and uses it as the reservation cap, so the number
 * quoted to the user is the number that gets reserved. It previously lived only
 * inside that route while this module quoted a different, larger figure.
 */
export const INITIATIVE_MAX_CREDITS = 5;

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

  // Budget scales with apparent scope, then clamps to what the initiative route
  // will ACTUALLY reserve.
  //
  // This scale used to run 12–60, which was invented: the route caps every run at
  // INITIATIVE_MAX_CREDITS and rejects a larger `budgetCredits` with a 400. So the
  // number shown to the user overstated the cost by an order of magnitude, and
  // passing it through would have failed the request outright. Quoting the real
  // ceiling is both honest and the only value the route accepts.
  const base = 12;
  const perSignal = 6;
  const fileBump = Math.min(12, Math.floor((opts.fileCount ?? 0) / 15));
  const scaled = base + signals.length * perSignal + fileBump;
  const suggestedBudgetCredits = Math.min(INITIATIVE_MAX_CREDITS, scaled);

  return {
    recommend: true,
    reason:
      "This looks like a multi-part build rather than a single change. The engineering-team mode plans it into epics, has specialist roles review each other, and verifies between waves — it produces better results on work this size, but costs more than a normal build.",
    signals,
    suggestedBudgetCredits,
  };
}

/**
 * Master switch for showing the SUGGESTION. Default OFF: with no env
 * configuration no user is ever shown the offer.
 */
export function initiativeRoutingEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const v = process.env.ENABLE_INITIATIVE_SUGGESTIONS;
  return v === "1" || v === "true";
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK-GATED AUTO-ROUTE
//
// The suggestion above was a half-measure: the strongest generation path stayed
// unreachable for everyone who never opened a side panel, which meant the best
// thing the platform could do was, in practice, not something it did. Requests
// that genuinely need a team — multi-subsystem, phased, long specs — now go to
// the team automatically.
//
// The cost objection from the original design still stands, so every one of these
// conditions must hold before a build is promoted:
//
//   1. the feature is on (default ON, `INITIATIVE_AUTOROUTE=off` disables it)
//   2. the request scores at or above the signal threshold — STRICTER than the
//      suggestion floor, so borderline requests are offered, not conscripted
//   3. the user's balance covers the quoted ceiling, checked before we commit
//   4. the caller declared it can actually run an initiative (see below)
//   5. the request did not explicitly ask for a plain build (`forceBuild`)
//
// Condition 4 matters more than it looks. Auto-routing means THIS request stops
// short of building, so if the caller cannot pick the initiative up, the user's
// message would silently accomplish nothing — the precise failure class this
// codebase keeps getting bitten by. API clients and older UI builds do not send
// the capability flag, so they keep the normal build path.
// ─────────────────────────────────────────────────────────────────────────────

/** Signals required to auto-route. Higher than the 2 needed to merely suggest. */
const DEFAULT_MIN_SIGNALS = 3;

/**
 * Phrases by which a user declines the team for this message.
 *
 * The handoff notice tells the user they can ask for a single-pass build instead,
 * so that has to actually work — a promised escape hatch that does nothing is its
 * own broken promise.
 */
const PLAIN_BUILD_REQUEST = [
  /\bjust build it\b/i,
  /\bjust do it\b/i,
  /\bsingle[-\s]?pass\b/i,
  /\bno\s+(team|initiative|orchestrat)/i,
  /\bskip\s+the\s+(team|planning|review)\b/i,
  /\b(quick|simple|fast)\s+build\b/i,
];

// The ceiling is INITIATIVE_MAX_CREDITS, declared at the top of this file and
// imported by the initiative route — there is no separate auto-route ceiling to
// keep in sync.

/** Default ON. Set INITIATIVE_AUTOROUTE to off/0/false to disable. */
export function initiativeAutoRouteEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const v = (process.env.INITIATIVE_AUTOROUTE ?? "").trim().toLowerCase();
  return !(v === "off" || v === "0" || v === "false");
}

/** Tunable threshold, clamped so it can never drop below the suggestion floor. */
export function initiativeAutoRouteMinSignals(): number {
  const raw = Number(process.env.INITIATIVE_AUTOROUTE_MIN_SIGNALS);
  if (!Number.isFinite(raw)) return DEFAULT_MIN_SIGNALS;
  return Math.max(2, Math.min(6, Math.trunc(raw)));
}

export interface AutoRouteDecision {
  /** Promote this request to an initiative run. */
  autoRoute: boolean;
  /** Show the offer instead, letting the user decide. */
  suggest: boolean;
  /** Credit ceiling to quote and reserve. */
  budgetCredits: number;
  reason: string;
  signals: string[];
  /** Why it was NOT auto-routed — logged, never guessed at later. */
  declinedBecause?: string;
}

/**
 * Decide between auto-routing, offering, or doing nothing.
 *
 * Pure and synchronous so it is cheap to call on every build and trivial to test;
 * the caller supplies the credit balance rather than this module reaching for it.
 */
export function decideInitiativeRouting(
  prompt: string,
  opts: {
    fileCount?: number;
    mode?: string;
    /** Available credits. Omit only when the balance is genuinely unknown. */
    credits?: number;
    /** Caller can run an initiative if this build is handed off. */
    clientCanRoute?: boolean;
    /** User asked for a plain build explicitly. */
    forceBuild?: boolean;
  } = {},
): AutoRouteDecision {
  const rec = recommendInitiative(prompt, { fileCount: opts.fileCount, mode: opts.mode });
  const budgetCredits = rec.suggestedBudgetCredits;
  const base = {
    autoRoute: false,
    suggest: false,
    budgetCredits,
    reason: rec.reason,
    signals: rec.signals,
  };

  if (!rec.recommend) return { ...base, budgetCredits: 0, reason: "", signals: [] };

  // Below here the request DOES look like an initiative — the only question left
  // is whether we may promote it or must ask.
  const offer = { ...base, suggest: initiativeRoutingEnabled() };

  if (!initiativeAutoRouteEnabled()) {
    return { ...offer, declinedBecause: "auto-route disabled by INITIATIVE_AUTOROUTE" };
  }
  if (opts.forceBuild) {
    return { ...offer, declinedBecause: "caller requested a plain build" };
  }
  if (PLAIN_BUILD_REQUEST.some((r) => r.test(prompt))) {
    return { ...offer, suggest: false, declinedBecause: "user asked for a single-pass build" };
  }
  if (!opts.clientCanRoute) {
    return { ...offer, declinedBecause: "caller cannot run an initiative" };
  }
  if (rec.signals.length < initiativeAutoRouteMinSignals()) {
    return {
      ...offer,
      declinedBecause: `${rec.signals.length} signals, need ${initiativeAutoRouteMinSignals()}`,
    };
  }
  if (typeof opts.credits === "number" && opts.credits < budgetCredits) {
    // Starting a run the balance cannot finish would strand it mid-wave, which is
    // worse than a single cheaper build that completes.
    return {
      ...offer,
      declinedBecause: `balance ${opts.credits} below quoted ceiling ${budgetCredits}`,
    };
  }

  return { ...base, autoRoute: true, suggest: false };
}
