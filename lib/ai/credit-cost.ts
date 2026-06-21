/**
 * Usage-based credit cost — Lovable-style fractional pricing.
 *
 * Many messages cost less than 1 credit; complex multi-file builds cost more.
 * Reference points (mirroring Lovable's published examples):
 *   - small style tweak            ~0.5
 *   - remove a component           ~0.9
 *   - add authentication           ~1.2
 *   - full landing page w/ images  ~2.0
 * Costs are rounded to 0.05 and clamped to [0.5, 5].
 */
export function computeCreditCost(params: {
  mode: string;
  filesGenerated?: number;
  tokensUsed?: number;
  usedSubagents?: boolean;
  usedAutoFix?: boolean;
}): number {
  const { mode, filesGenerated = 0, tokensUsed = 0, usedSubagents, usedAutoFix } = params;

  if (mode === "plan" || mode === "chat") {
    // Conversational: 0.5 base, up to 1.0 for very long exchanges
    const cost = 0.5 + Math.min(tokensUsed / 16_000, 0.5);
    return clampRound(cost);
  }

  // Build / agent / patch — scales with files touched + tokens consumed
  let cost = 0.5;
  cost += Math.min(filesGenerated * 0.15, 1.5);          // file complexity
  cost += Math.min(tokensUsed / 10_000, 1.5) * 0.5;      // token complexity
  if (usedSubagents) cost += 0.5;
  if (usedAutoFix) cost += 0.5;

  return clampRound(cost);
}

function clampRound(cost: number): number {
  const clamped = Math.max(0.5, Math.min(5, cost));
  return Math.round(clamped * 20) / 20; // 0.05 granularity
}

/** Format a credit amount for display ("1", "0.5", "1.25"). */
export function formatCredits(amount: number): string {
  if (Number.isInteger(amount)) return String(amount);
  return String(Math.round(amount * 100) / 100);
}
