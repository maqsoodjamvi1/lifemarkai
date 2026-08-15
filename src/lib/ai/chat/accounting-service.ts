import {
  cancelCreditReservation,
  claimDailyCredits,
  reserveCredits,
  settleCreditReservation,
} from "../../credits.ts";
import { computeCreditCost,maxCreditCostForMode } from "../credit-cost.ts";

export { claimDailyCredits,computeCreditCost,maxCreditCostForMode };

export async function reserveStageCredits(
  ...args: Parameters<typeof reserveCredits>
): ReturnType<typeof reserveCredits> {
  return reserveCredits(...args);
}

export async function settleStageCredits(
  ...args: Parameters<typeof settleCreditReservation>
): ReturnType<typeof settleCreditReservation> {
  return settleCreditReservation(...args);
}

export async function cancelStageCredits(
  ...args: Parameters<typeof cancelCreditReservation>
): ReturnType<typeof cancelCreditReservation> {
  return cancelCreditReservation(...args);
}
