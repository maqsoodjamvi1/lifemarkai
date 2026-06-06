import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/account/sessions — list active sessions for the current user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Supabase Auth doesn't expose session list via client SDK directly,
  // so we return the current session info + audit log entries as a proxy.
  const { data: session } = await supabase.auth.getSession();

  // Read audit log for login events (last 20)
  const { data: auditRows } = await (supabase as any)
    .from("audit_logs")
    .select("*")
    .eq("user_id", user.id)
    .in("action", ["login", "logout", "token_refresh"])
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    currentSession: session?.session
      ? {
          id: session.session.access_token.slice(-8),
          created_at: session.session.user.created_at,
          last_sign_in: user.last_sign_in_at,
          user_agent: typeof window !== "undefined" ? navigator.userAgent : "Server",
          isCurrent: true,
        }
      : null,
    auditLog: auditRows ?? [],
  });
}

// DELETE /api/account/sessions — sign out all other sessions
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Sign out globally revokes all refresh tokens
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
