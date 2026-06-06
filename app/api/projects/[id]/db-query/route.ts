import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

// Blocklist dangerous SQL statements
const BLOCKED = /^\s*(drop|truncate|delete\s+from\s+auth|alter\s+table|create\s+user|grant|revoke|pg_terminate_backend)\b/i;

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!project || (project as any).user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { sql?: string };
  const sql = body.sql?.trim();
  if (!sql) return NextResponse.json({ error: "No SQL provided" }, { status: 400 });
  if (BLOCKED.test(sql)) {
    return NextResponse.json({ error: "This statement type is not allowed in the playground." }, { status: 400 });
  }

  try {
    // Use Supabase RPC to run arbitrary SQL (requires a helper function in the DB)
    // Falls back to direct postgres execution if available
    const { data, error } = await (supabase as any).rpc("exec_sql", { query: sql });

    if (error) {
      // Try simple select via from() as fallback
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    return NextResponse.json({ rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
