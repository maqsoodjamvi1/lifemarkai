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
