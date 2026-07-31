/**
 * Native billing helpers (GET credits).
 *
 * Plain functions — not createServerFn. Route handlers that call createServerFn
 * in the production build hit the server-fn RPC resolver and throw
 * "Server function info not found" → 500.
 */
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { ensureDevCredits } from "@/lib/dev-credits";

export async function getCredits(input: { debugZeroCredits?: boolean } = {}) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("credits, plan")
    .eq("id", user.id)
    .maybeSingle();

  const { data: memberships } = await (supabase as any)
    .from("team_members")
    .select("team_id, role, credits_used, credit_allowance, teams(id, name, credits)")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null);

  let credits = profile?.credits ?? 0;
  const debugZero =
    input.debugZeroCredits === true && process.env.NODE_ENV === "development";

  if (debugZero) {
    credits = 0;
  } else {
    const granted = await ensureDevCredits(user.id);
    if (granted !== null) credits = granted;
  }

  return {
    status: "ok" as const,
    credits,
    plan: profile?.plan ?? "free",
    teams: memberships ?? [],
  };
}
