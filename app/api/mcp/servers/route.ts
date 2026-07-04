import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";
import { mcpInitialize, mcpListTools } from "@/lib/ai/mcp-client";

export const runtime = "nodejs";

const MAX_SERVERS_PER_USER = 10;
const AUTH_MASK = "•••";

interface ServerRow {
  id: string;
  user_id: string;
  name: string;
  url: string;
  auth_header: string | null;
  enabled: boolean;
  last_status: string | null;
  last_tools: unknown;
  created_at: string;
  updated_at: string;
}

/** Never expose stored auth header values to the client. */
function sanitize(row: ServerRow) {
  const { auth_header, ...rest } = row;
  return { ...rest, hasAuth: !!auth_header, auth_header: auth_header ? AUTH_MASK : null };
}

function validateUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]";
    if (parsed.protocol !== "https:" && !isLocalhost) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// ── GET: list own servers (auth headers masked) ─────────────────────────────
export async function GET() {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await (supabase as any)
    .from("user_mcp_servers")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ servers: ((data ?? []) as ServerRow[]).map(sanitize) });
}

// ── POST: create {name,url,authHeader?} OR test {action:"test", id} ────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  // ── Test connection: initialize + list tools, persist status ─────────────
  if (body?.action === "test") {
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { data: row } = await (supabase as any)
      .from("user_mcp_servers")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (!row) return NextResponse.json({ error: "Server not found" }, { status: 404 });

    let lastStatus: string;
    let tools: Array<{ name: string; description: string }> = [];
    try {
      const init = await mcpInitialize(row.url, row.auth_header);
      const fullTools = await mcpListTools(row.url, row.auth_header, init.sessionId);
      // Store names + descriptions ONLY — never tool-call results.
      tools = fullTools.map((t) => ({ name: t.name, description: t.description.slice(0, 300) }));
      lastStatus = `ok: ${tools.length} tools`;
    } catch (err) {
      lastStatus = `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500);
    }

    await (supabase as any)
      .from("user_mcp_servers")
      .update({ last_status: lastStatus, last_tools: tools })
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json({ status: lastStatus, tools, ok: lastStatus.startsWith("ok") });
  }

  // ── Create ────────────────────────────────────────────────────────────────
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const url = validateUrl(body?.url);
  if (!url) {
    return NextResponse.json(
      { error: "url must be a valid https URL (localhost allowed for dev)" },
      { status: 400 }
    );
  }
  const authHeader =
    typeof body?.authHeader === "string" && body.authHeader.trim()
      ? body.authHeader.trim().slice(0, 500)
      : null;

  const { count } = await (supabase as any)
    .from("user_mcp_servers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_SERVERS_PER_USER) {
    return NextResponse.json(
      { error: `Limit reached: max ${MAX_SERVERS_PER_USER} MCP servers per account.` },
      { status: 400 }
    );
  }

  const { data, error } = await (supabase as any)
    .from("user_mcp_servers")
    .insert({ user_id: user.id, name, url, auth_header: authHeader })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ server: sanitize(data as ServerRow) }, { status: 201 });
}

// ── PATCH: {id, name?, url?, authHeader?, enabled?} ─────────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim().slice(0, 60);
  if (body.url !== undefined) {
    const url = validateUrl(body.url);
    if (!url) return NextResponse.json({ error: "url must be a valid https URL" }, { status: 400 });
    updates.url = url;
  }
  if (body.authHeader !== undefined) {
    updates.auth_header =
      typeof body.authHeader === "string" && body.authHeader.trim()
        ? body.authHeader.trim().slice(0, 500)
        : null;
  }
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("user_mcp_servers")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Server not found" }, { status: 404 });

  return NextResponse.json({ server: sanitize(data as ServerRow) });
}

// ── DELETE: ?id= ────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await (supabase as any)
    .from("user_mcp_servers")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
