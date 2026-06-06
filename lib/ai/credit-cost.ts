/** Usage-based credit cost (Lovable-style variable pricing, integer credits). */
export function computeCreditCost(params: {
  mode: string;
  filesGenerated?: number;
  tokensUsed?: number;
  usedSubagents?: boolean;
  usedAutoFix?: boolean;
}): number {
  const { mode, filesGenerated = 0, tokensUsed = 0, usedSubagents, usedAutoFix } = params;

  if (mode === "plan" || mode === "chat") return 1;

  // Build / agent / patch — base 1, scales with complexity (max 5)
  let cost = 1;
  if (filesGenerated > 0) cost += Math.min(Math.ceil(filesGenerated / 3), 2);
  if (tokensUsed > 12_000) cost += 1;
  else if (tokensUsed > 6_000) cost += 0.5;
  if (usedSubagents) cost += 0.5;
  if (usedAutoFix) cost += 0.5;

  return Math.max(1, Math.min(5, Math.ceil(cost)));
}
