import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { randomBytes, createHash } from "crypto";

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateKey(): { key: string; prefix: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const key = `lmk_${raw}`;
  const prefix = key.slice(0, 12); // "lmk_" + first 8 chars
  const hash = createHash("sha256").update(key).digest("hex");
  return { key, prefix, hash };
}

// ── GET — list keys (metadata only, never plaintext) ─────────────────────────
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await (supabase as any)
    .from("api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keys: data ?? [] });
}

// ── POST — create a new key ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; scopes?: string[]; expiresAt?: string };
  const name = (body.name ?? "").trim();
  if (!name || name.length > 64) {
    return NextResponse.json({ error: "name is required (max 64 chars)" }, { status: 400 });
  }

  const scopes: string[] = Array.isArray(body.scopes) ? body.scopes : ["ai:chat", "projects:read"];
  const validScopes = new Set(["ai:chat", "ai:plan", "ai:build", "projects:read", "projects:write", "deploy"]);
  for (const s of scopes) {
    if (!validScopes.has(s)) {
      return NextResponse.json({ error: `Invalid scope: ${s}` }, { status: 400 });
    }
  }

  // Enforce max 10 active keys per user
  const { count } = await (supabase as any)
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: "Maximum of 10 active API keys allowed" }, { status: 422 });
  }

  const { key, prefix, hash } = generateKey();

  const { data: inserted, error } = await (supabase as any)
    .from("api_keys")
    .insert({
      user_id: user.id,
      name,
      key_hash: hash,
      key_prefix: prefix,
      scopes,
      expires_at: body.expiresAt ?? null,
      is_active: true,
    })
    .select("id, name, key_prefix, scopes, expires_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return the plaintext key ONCE — never stored
  return NextResponse.json({ key: inserted, plaintext: key }, { status: 201 });
}

// ── PATCH — rename or toggle active ──────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, is_active } = await req.json() as { id: string; name?: string; is_active?: boolean };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof name === "string") updates.name = name.trim().slice(0, 64);
  if (typeof is_active === "boolean") updates.is_active = is_active;

  const { error } = await (supabase as any)
    .from("api_keys")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// ── DELETE — revoke a key ─────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await (supabase as any)
    .from("api_keys")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// ── Exported validator (used by other API routes) ─────────────────────────────
export async function validateApiKey(
  key: string
): Promise<{ userId: string; scopes: string[] } | null> {
  if (!key.startsWith("lmk_")) return null;

  const hash = createHash("sha256").update(key).digest("hex");
  const supabase = await createAdminClient();

  const { data } = await (supabase as any)
    .from("api_keys")
    .select("user_id, scopes, expires_at, is_active")
    .eq("key_hash", hash)
    .eq("is_active", true)
    .single();

  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) return null;

  // Update last_used_at (fire and forget)
  void (supabase as any)
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", hash);

  return { userId: data.user_id as string, scopes: (data.scopes as string[]) ?? [] };
}
