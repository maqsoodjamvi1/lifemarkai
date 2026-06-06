import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

const GET_USER_TIMEOUT_MS = 3000;

export type ServerUserResult = {
  user: User | null;
  authError: Error | null;
  source: "getUser" | "session" | null;
};

/** Resolve the current user; prefers fast cookie session when Supabase is slow/unreachable. */
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
    return { user: sessionUser, authError, source: "session" };
  }

  return { user: null, authError, source: null };
}
