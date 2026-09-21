import type { Session } from "@supabase/supabase-js";

type SessionResult = { data: { session: Session | null }; error: Error | null };

/** Resolve credentials for each request, including after SDK token rotation. */
export function createCampaignCookieProvider(
  auth: { getSession(): Promise<SessionResult>; refreshSession(): Promise<SessionResult> },
  encode: (session: Session) => string,
  now = Date.now,
) {
  return async () => {
    let result = await auth.getSession();
    if (result.error) throw result.error;
    if (!result.data.session) throw new Error("Campaign session is missing");
    // Leave enough time for the longest generation request to complete.
    if ((result.data.session.expires_at ?? 0) * 1000 - now() < 600_000) {
      result = await auth.refreshSession();
      if (result.error) throw result.error;
      if (!result.data.session) throw new Error("Campaign session refresh returned no session");
    }
    return encode(result.data.session);
  };
}
