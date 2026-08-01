/**
 * Native account server-fns — reimplemented off the worker (pure Supabase).
 * Port of app/api/account/sessions/route.ts.
 */
import { createClient } from "@/lib/supabase/server";

export async function listSessions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthorized" as const };

  const { data: session } = await supabase.auth.getSession();
  const { data: auditRows } = await (supabase as any)
    .from("audit_logs")
    .select("*")
    .eq("user_id", user.id)
    .in("action", ["login", "logout", "token_refresh"])
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    status: "ok" as const,
    currentSession: session?.session
      ? {
          id: session.session.access_token.slice(-8),
          created_at: session.session.user.created_at,
          last_sign_in: user.last_sign_in_at,
          user_agent: "Server",
          isCurrent: true,
        }
      : null,
    auditLog: auditRows ?? [],
  };
}

/** Sign out all other sessions (global refresh-token revoke). */
export async function signOutOtherSessions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthorized" as const };

  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { status: "error" as const, message: error.message };
  return { status: "ok" as const };
}
