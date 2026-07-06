/**
 * Canonical API-key validation + scope enforcement for the public API and the
 * MCP server. Keys are `lmk_…` tokens stored as SHA-256 hashes in `api_keys`
 * (migration 008). This is the single source of truth — `app/api/keys/route.ts`
 * re-exports `validateApiKey` from here for backwards compatibility.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";

export type ApiScope = "ai:chat" | "ai:plan" | "ai:build" | "projects:read" | "projects:write" | "deploy";

export interface ApiKeyIdentity {
  userId: string;
  scopes: string[];
}

/** Validate a raw `lmk_…` key; returns identity or null. Updates last_used_at. */
export async function validateApiKey(key: string): Promise<ApiKeyIdentity | null> {
  if (!key || !key.startsWith("lmk_")) return null;

  const hash = createHash("sha256").update(key).digest("hex");
  const supabase = await createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("api_keys")
    .select("user_id, scopes, expires_at, is_active")
    .eq("key_hash", hash)
    .eq("is_active", true)
    .single();

  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) return null;

  // Fire-and-forget last_used_at bump.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (supabase as any)
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", hash);

  return { userId: data.user_id as string, scopes: (data.scopes as string[]) ?? [] };
}

/**
 * A key with an empty scope list is treated as full-access (legacy keys created
 * before scopes existed). Otherwise the scope must be explicitly present.
 */
export function hasScope(scopes: string[], required: ApiScope): boolean {
  if (!scopes || scopes.length === 0) return true;
  return scopes.includes(required);
}

/** Pull the raw token from an Authorization: Bearer header or a ?token= query param. */
export function extractBearer(req: { headers: Headers; url: string }): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7).trim();
  try {
    const q = new URL(req.url).searchParams.get("token");
    if (q) return q.trim();
  } catch { /* ignore malformed url */ }
  return null;
}

export interface AuthOk { ok: true; userId: string; scopes: string[] }
export interface AuthErr { ok: false; status: 401 | 403; error: string }

/**
 * Authenticate a public-API request and (optionally) require a scope.
 * Returns a discriminated result so callers can turn it into a NextResponse.
 */
export async function authenticateApiRequest(
  req: { headers: Headers; url: string },
  requiredScope?: ApiScope,
): Promise<AuthOk | AuthErr> {
  const token = extractBearer(req);
  if (!token) return { ok: false, status: 401, error: "Missing API key. Send 'Authorization: Bearer lmk_…'." };

  const identity = await validateApiKey(token);
  if (!identity) return { ok: false, status: 401, error: "Invalid or revoked API key." };

  if (requiredScope && !hasScope(identity.scopes, requiredScope)) {
    return { ok: false, status: 403, error: `API key is missing the '${requiredScope}' scope.` };
  }
  return { ok: true, userId: identity.userId, scopes: identity.scopes };
}
