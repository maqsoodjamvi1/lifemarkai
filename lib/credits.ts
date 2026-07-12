/**
 * Unified billing conversion rate (migration 074): 1 credit = 4 cents.
 * Rationale: Pro is $20/mo for 500 credits → 2000¢ / 500cr = 4¢/credit.
 * Must match the `v_rate` constant in supabase/migrations/074_unified_credit_balance.sql
 * and CENTS_PER_CREDIT in gateway/src/index.ts.
 */
export const CENTS_PER_CREDIT = 4;

export interface CreditReservation {
  id: string;
  amount: number;
}

/** Atomically claim one daily free editor action; 0 means quota exhausted. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function claimFreeCreditAction(
  supabase: any,
  params: {
    userId: string;
    action: "auto_fix" | "inline_edit";
    dailyLimit: number;
    projectId?: string | null;
  },
): Promise<number> {
  if (!Number.isInteger(params.dailyLimit) || params.dailyLimit < 1) {
    throw new Error("Daily free action limit must be a positive integer");
  }
  const { data, error } = await supabase.rpc("claim_free_credit_action", {
    p_user_id: params.userId,
    p_action: params.action,
    p_daily_limit: params.dailyLimit,
    p_project_id: params.projectId ?? null,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  const used = Number(data ?? 0);
  return Number.isInteger(used) && used > 0 ? used : 0;
}

function rpcErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Credit RPC failed");
  }
  return "Credit RPC failed";
}

/**
 * Daily free credits (Lovable parity): every user receives 5 credits per UTC
 * day, capped per calendar month (30 free / 150 paid). The grant lives in the
 * `grant_daily_credits` RPC (migration 063) and is idempotent per day.
 *
 * It's also called inside `deduct_credits`, but API routes must claim BEFORE
 * their balance gate — otherwise a user at 0 credits is blocked even though
 * today's daily credits would cover the request.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function claimDailyCredits(supabase: any, userId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("grant_daily_credits", { p_user_id: userId });
    if (error) return 0; // pre-063 DB or RLS issue — non-fatal
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

/**
 * Atomically reserve credits before starting provider work. The backing RPC
 * locks the profile row, grants the daily allowance, and subtracts the maximum
 * charge so concurrent requests cannot spend the same balance twice.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reserveCredits(
  supabase: any,
  params: {
    userId: string;
    amount: number;
    action: string;
    projectId?: string | null;
    ttlSeconds?: number;
  },
): Promise<CreditReservation | null> {
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Credit reservation amount must be positive");
  }

  const { data, error } = await supabase.rpc("reserve_credits", {
    p_user_id: params.userId,
    p_amount: amount,
    p_action: params.action,
    p_project_id: params.projectId ?? null,
    p_ttl_seconds: params.ttlSeconds ?? 1800,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  if (typeof data !== "string" || data.length === 0) return null;
  return { id: data, amount };
}

/** Settle a reservation to its actual cost and return the user's new balance. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function settleCreditReservation(
  _supabase: any,
  reservationId: string,
  actualAmount: number,
): Promise<number> {
  const amount = Number(actualAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Settled credit amount cannot be negative");
  }
  const admin = await createAdminClient();
  const { data, error } = await (admin as any).rpc("settle_credit_reservation", {
    p_reservation_id: reservationId,
    p_actual_amount: amount,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  if (data == null) throw new Error("Credit reservation is no longer active");
  const balance = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(balance)) throw new Error("Invalid credit settlement response");
  return balance;
}

/** Cancel unused provider work and return the user's new balance. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cancelCreditReservation(
  _supabase: any,
  reservationId: string,
): Promise<number> {
  const admin = await createAdminClient();
  const { data, error } = await (admin as any).rpc("cancel_credit_reservation", {
    p_reservation_id: reservationId,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  if (data == null) throw new Error("Credit reservation cannot be cancelled");
  const balance = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(balance)) throw new Error("Invalid credit cancellation response");
  return balance;
}
