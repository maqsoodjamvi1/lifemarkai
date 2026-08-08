import type { EditorMode } from "@/components/editor/editor-layout";
import { computeCreditCost,formatCredits } from "./credit-cost.ts";

/** Pre-send credit estimate label for the composer (Lovable parity). */
export function estimateMessageCredits(
  mode: EditorMode,
  opts?: { inputLength?: number; hasAttachments?: boolean; fileCount?: number },
): string {
  const len = opts?.inputLength ?? 0;
  const files = opts?.fileCount ?? 0;
  // Approximate tokens from prompt length; routes use real usage after the fact.
  const tokensUsed = Math.max(200, Math.round(len / 3) + (opts?.hasAttachments ? 800 : 0));
  // Context file count is the best pre-send stand-in for filesGenerated.
  const filesGenerated =
    mode === "chat" || mode === "plan"
      ? 0
      : Math.max(files, opts?.hasAttachments ? 2 : mode === "agent" ? 3 : 1);

  const cost = computeCreditCost({
    mode,
    filesGenerated,
    tokensUsed,
    usedSubagents: mode === "agent" && files > 5,
  });

  return `~${formatCredits(cost)} credit${cost === 1 ? "" : "s"}`;
}
