/**
 * GET  /api/mcp/token  — return the user's current MCP API token
 * POST /api/mcp/token  — regenerate (rotate) the token
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const { data } = await (admin as any)
    .from("profiles")
    .select("mcp_api_token")
    .eq("id", user.id)
    .single();

  return NextResponse.json({ token: data?.mcp_api_token ?? null });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await (admin as any)
    .from("profiles")
    .update({ mcp_api_token: newToken })
    .eq("id", user.id);

  return NextResponse.json({ token: newToken });
}
