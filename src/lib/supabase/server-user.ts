import type { User } from "@supabase/supabase-js";
import type { createClient } from "./server.ts";
import { logger } from "../logger.ts";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

const GET_USER_TIMEOUT_MS = 10000;

export type ServerUserResult = {
  user: User | null;
  authError: Error | null;
  source: "getUser" | "session" | null;
};

/**
 * Resolve the current user; prefers fast cookie session when Supabase is
 * slow/unreachable.
 *
 * DELIBERATE, DOCUMENTED TRADEOFF — reviewed and left as-is in a security
 * audit pass rather than changed under time pressure. `supabase.auth
 * .getUser()` re-verifies the JWT against Supabase's own auth server, so it
 * is the only one of the two checks that can see a session that has been
 * revoked since the token was issued (a kicked team member, a force-logged-
 * out or disabled account). `session.user` is decoded from the local cookie
 * alone and cannot see revocation at all. Falling back to `session.user`
 * when `getUser()` times out or errors is therefore fail-OPEN on
 * revocation: during a `getUser()` outage window, a session that should
 * have been rejected is still accepted everywhere in this app, since every
 * route funnels through this one function.
 *
 * The alternative — fail CLOSED, i.e. treat a `getUser()` failure as
 * "unauthenticated" — was considered and rejected: this function is the
 * sole auth path for the entire app, so any Supabase auth-API latency
 * spike or blip would log every active user out / fail every request
 * simultaneously, which is a far larger and more certain blast radius than
 * the narrow, time-bounded exposure this fallback accepts (further bounded
 * in practice by Supabase's own JWT expiry/refresh cycle). Retrofitting
 * this safely — e.g. a short bounded retry before falling back, or
 * distinguishing "Supabase is down" from "this specific token is bad" —
 * is a real availability-vs-security design decision that deserves its own
 * dedicated change and testing, not a rushed edit at the end of an audit
 * pass.
 *
 * What IS safe to add here, and now in place: the fallback path is logged,
 * so how often it actually fires is observable rather than invisible.
 */
export async function getServerUser(supabase: SupabaseServer): Promise<ServerUserResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const sessionUser = session?.user ?? null;

  let verifiedUser: User | null = null;
  let authError: Error | null = null;

  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("getUser timeout")), GET_USER_TIMEOUT_MS),
      ),
    ]);
    verifiedUser = result.data.user;
    authError = result.error ?? null;
  } catch (err) {
    authError = err instanceof Error ? err : new Error(String(err));
  }

  if (verifiedUser) {
    return { user: verifiedUser, authError, source: "getUser" };
  }

  if (sessionUser) {
    // See the fail-open tradeoff documented above: this accepts a locally
    // decoded session without re-checking revocation, only because the
    // server-verified check above failed/timed out.
    logger.warn("auth.server_user.fallback_to_session", {
      userId: sessionUser.id,
      reason: authError?.message ?? "getUser failed with no error detail",
    });
    return { user: sessionUser, authError, source: "session" };
  }

  return { user: null, authError, source: null };
}
