/**
 * Which model performs a given repair attempt.
 *
 * Its own leaf module on purpose. It lived inside repair-service.ts, which
 * transitively imports the Supabase server client and therefore cannot be
 * loaded in a plain `node --test` process at all — so the ladder that decides
 * how much every repair costs was structurally untestable. Keeping it here,
 * with only model-defaults as a dependency, is what lets
 * repair-model-ladder.test.ts assert it directly.
 */
import {
  DEFAULT_CODING_MODEL,
  ECONOMY_CODING_MODEL,
  ESCALATION_MODEL,
} from "../model-defaults.ts";

/**
 * Which model performs THIS repair attempt.
 *
 * Extracted and exported so the ladder can be asserted without a network call:
 * the bug this replaced was invisible in every test because the choice was
 * buried inside a streaming generation call.
 *
 * The ladder documented in model-defaults.ts is "GENERATE performs the FIRST
 * repair; ESCALATE performs the final one, after the first demonstrably
 * failed". This function did not implement it: every branch except
 * simpleEconomyRequest went straight to ESCALATION_MODEL, so the escalation
 * tier was in fact the DEFAULT repair tier and fired on attempt zero, before
 * anything had been shown to fail. That was survivable while escalation was a
 * mid-priced slug; with escalation on claude-opus-5 ($0.45/call against the
 * generator's ~$0.012) it would have put the most expensive model in the
 * product on the first pass of a loop that runs on ordinary validation errors.
 *
 * Gate on the round instead — which is what the docs already promised and what
 * self-verify.ts's fixLadder already does.
 */
export function selectRepairModel(options: {
  simpleEconomyRequest: boolean;
  round?: number;
}): string {
  if (options.simpleEconomyRequest) return ECONOMY_CODING_MODEL;
  return (options.round ?? 0) === 0 ? DEFAULT_CODING_MODEL : ESCALATION_MODEL;
}
