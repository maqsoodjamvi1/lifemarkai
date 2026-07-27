// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { randomBytes, createHash } from "node:crypto";
import { logAuditFromRequest } from "@/lib/audit/log";

/**
 * Native /api/keys — public-API key management.
 *   GET    → list keys (metadata only)
 *   POST   → create a key (returns plaintext once)
 *   PATCH  → rename / toggle active
 *   DELETE → revoke
 */
function generateKey(): { key: string; prefix: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const key = `lmk_${raw}`;
  const prefix = key.slice(0, 12);
  const hash = createHash("sha256").update(key).digest("hex");
  return { key, prefix, hash };
}

export const Route = createFileRoute("/api/keys")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data, error } = await (supabase as any)
          .from("api_keys")
          .select("id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ keys: data ?? [] });
      },

      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json()) as { name?: string; scopes?: string[]; expiresAt?: string };
        const name = (body.name ?? "").trim();
        if (!name || name.length > 64) {
          return Response.json({ error: "name is required (max 64 chars)" }, { status: 400 });
        }

        const scopes: string[] = Array.isArray(body.scopes) ? body.scopes : ["ai:chat", "projects:read"];
        const validScopes = new Set(["ai:chat", "ai:plan", "ai:build", "projects:read", "projects:write", "deploy"]);
        for (const s of scopes) {
          if (!validScopes.has(s)) return Response.json({ error: `Invalid scope: ${s}` }, { status: 400 });
        }

        const { count } = await (supabase as any)
          .from("api_keys")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_active", true);
        if ((count ?? 0) >= 10) {
          return Response.json({ error: "Maximum of 10 active API keys allowed" }, { status: 422 });
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

        if (error) return Response.json({ error: error.message }, { status: 500 });

        void logAuditFromRequest(request, {
          userId: user.id,
          action: "auth.apikey.create",
          resourceType: "api_key",
          resourceId: inserted?.id ?? null,
          metadata: { name, scopes, keyPrefix: prefix },
        });
        return Response.json({ key: inserted, plaintext: key }, { status: 201 });
      },

      PATCH: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { id, name, is_active } = (await request.json()) as { id: string; name?: string; is_active?: boolean };
        if (!id) return Response.json({ error: "id required" }, { status: 400 });

        const updates: Record<string, unknown> = {};
        if (typeof name === "string") updates.name = name.trim().slice(0, 64);
        if (typeof is_active === "boolean") updates.is_active = is_active;

        const { error } = await (supabase as any)
          .from("api_keys").update(updates).eq("id", id).eq("user_id", user.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ success: true });
      },

      DELETE: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const id = new URL(request.url).searchParams.get("id");
        if (!id) return Response.json({ error: "id required" }, { status: 400 });

        const { error } = await (supabase as any)
          .from("api_keys").delete().eq("id", id).eq("user_id", user.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        void logAuditFromRequest(request, {
          userId: user.id,
          action: "auth.apikey.revoke",
          resourceType: "api_key",
          resourceId: id,
        });
        return Response.json({ success: true });
      },
    },
  },
});
