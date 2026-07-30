// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/server";
import { createHash, createVerify, timingSafeEqual } from "node:crypto";
import { sendEmail } from "@/lib/email/resend";
import { logger } from "@/lib/logger";

/**
 * POST /api/security/leaked-key — GitHub secret-scanning partner callback.
 *
 * Gap #8. Lovable auto-revokes leaked workspace API keys on 25 July; we had manual
 * revocation only, so a key pushed to a public repo stayed valid until somebody
 * noticed.
 *
 * HOW THIS WORKS. GitHub scans public pushes for registered token patterns and
 * POSTs matches to the partner's endpoint. The body is a JSON array of matches; the
 * signature is in `Github-Public-Key-Signature` and the key id in
 * `Github-Public-Key-Identifier`. Verification is ECDSA-P256-SHA256 over the RAW
 * body against GitHub's published public keys.
 *
 * WHY THE SIGNATURE CHECK IS NOT OPTIONAL. This endpoint revokes credentials on
 * unauthenticated input. Without verification it is a denial-of-service primitive:
 * anyone who could guess a token prefix could revoke other people's keys. So an
 * unverifiable request is rejected before anything is read, and the endpoint refuses
 * to run at all if no verification key is configured — failing CLOSED, unlike the
 * download policy, because here the risk of acting on forged input is worse than
 * the risk of missing a real leak.
 *
 * REVOCATION IS IRREVERSIBLE AND IMMEDIATE, by design. A leaked key is already
 * public; the only useful response is to make it worthless now and tell the owner.
 * That is also why this is the one destructive action in the codebase with no
 * confirmation step — there is nobody to ask, and waiting is the harm.
 */

/** GitHub's secret-scanning public keys endpoint. */
const GH_KEYS_URL = "https://api.github.com/meta/public_keys/secret_scanning";

interface GhMatch {
  token?: string;
  type?: string;
  url?: string;
  source?: string;
}

/** Fetch and cache GitHub's signing keys for the process lifetime. */
let keyCache: { fetchedAt: number; keys: Map<string, string> } | null = null;
const KEY_TTL_MS = 60 * 60 * 1000;

async function getGithubKey(keyId: string): Promise<string | null> {
  if (keyCache && Date.now() - keyCache.fetchedAt < KEY_TTL_MS) {
    const hit = keyCache.keys.get(keyId);
    if (hit) return hit;
  }
  try {
    const res = await fetch(GH_KEYS_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "LifemarkAI" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { public_keys?: Array<{ key_identifier: string; key: string }> };
    const keys = new Map((body.public_keys ?? []).map((k) => [k.key_identifier, k.key]));
    keyCache = { fetchedAt: Date.now(), keys };
    return keys.get(keyId) ?? null;
  } catch {
    return null;
  }
}

function verifySignature(rawBody: string, signatureB64: string, publicKeyPem: string): boolean {
  try {
    const verifier = createVerify("sha256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKeyPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/**
 * Keys are stored hashed (see lib/api/api-key.ts), so a leaked plaintext token is
 * matched by hashing it the same way. Compared with timingSafeEqual out of habit
 * rather than necessity — the value is already public.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/security/leaked-key")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Fail closed if verification is impossible.
        const keyId = request.headers.get("Github-Public-Key-Identifier");
        const signature = request.headers.get("Github-Public-Key-Signature");
        if (!keyId || !signature) {
          return Response.json({ error: "Missing signature headers" }, { status: 401 });
        }

        // The signature covers the RAW body — parse only after verifying.
        const rawBody = await request.text();
        const publicKeyPem = await getGithubKey(keyId);
        if (!publicKeyPem) {
          logger.warn("security.leaked_key.unknown_key_id", { keyId });
          return Response.json({ error: "Unrecognised signing key" }, { status: 401 });
        }
        if (!verifySignature(rawBody, signature, publicKeyPem)) {
          logger.warn("security.leaked_key.bad_signature", { keyId });
          return Response.json({ error: "Signature verification failed" }, { status: 401 });
        }

        let matches: GhMatch[];
        try {
          const parsed = JSON.parse(rawBody);
          matches = Array.isArray(parsed) ? parsed : [];
        } catch {
          return Response.json({ error: "Malformed body" }, { status: 400 });
        }

        // Admin client: this runs with no user session, and revoking a key the
        // caller does not own is the entire point.
        const supabase = createAdminClient();
        const results: Array<{ type?: string; revoked: boolean }> = [];

        for (const m of matches) {
          if (!m.token) {
            results.push({ type: m.type, revoked: false });
            continue;
          }
          const tokenHash = hashToken(m.token);

          // NOTE ON COLUMNS. `api_keys` (migration 008) gates validity on
          // `is_active`, not a `revoked_at` timestamp — so setting only a timestamp
          // would have recorded the revocation without actually revoking anything,
          // and `validateApiKey` would have kept accepting the leaked key. The
          // boolean is what matters; migration 157 adds the timestamp and reason
          // alongside it so the audit trail says WHEN and WHY, not just that it
          // happened.
          const { data: keyRows } = await supabase
            .from("api_keys")
            .select("id, user_id, name, key_hash, is_active")
            .eq("key_hash", tokenHash)
            .limit(1);

          const key = keyRows?.[0];
          if (!key || !hashesEqual(key.key_hash as string, tokenHash)) {
            // Not one of ours. GitHub expects a per-match verdict either way —
            // "false_positive" tells it to stop reporting this token.
            results.push({ type: m.type, revoked: false });
            continue;
          }

          if (key.is_active === false) {
            results.push({ type: m.type, revoked: true });
            continue;
          }

          await supabase
            .from("api_keys")
            .update({
              is_active: false,
              revoked_at: new Date().toISOString(),
              revoked_reason: `Auto-revoked: found in a public repository${m.url ? ` (${m.url})` : ""}`,
            })
            .eq("id", key.id);

          // Audit first, email second: the record must exist even if mail fails.
          await supabase.from("audit_logs").insert({
            user_id: key.user_id,
            action: "api_key.auto_revoked",
            resource_type: "api_key",
            resource_id: key.id,
            metadata: { source: "github_secret_scanning", url: m.url ?? null, token_type: m.type ?? null },
          });

          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("email")
              .eq("id", key.user_id)
              .maybeSingle();
            if (profile?.email) {
              await sendEmail({
                to: profile.email as string,
                subject: "Your LifemarkAI API key was revoked (found in a public repository)",
                html: `<p>GitHub found one of your LifemarkAI API keys in a public repository, so we revoked it immediately.</p>
<p><strong>Key:</strong> ${String(key.name ?? "unnamed")}<br/>
${m.url ? `<strong>Where:</strong> <a href="${m.url}">${m.url}</a><br/>` : ""}</p>
<p>This is irreversible — the key no longer works. Create a replacement in Settings → API keys, and remove the key from the repository history, not just the latest commit.</p>`,
              });
            }
          } catch (mailErr) {
            // A failed notification must not undo a completed revocation.
            logger.warn("security.leaked_key.email_failed", { keyId: key.id, error: String(mailErr) });
          }

          logger.info("security.leaked_key.revoked", { keyId: key.id, url: m.url ?? null });
          results.push({ type: m.type, revoked: true });
        }

        // GitHub's expected response shape: one verdict per match.
        return Response.json(
          matches.map((m, i) => ({
            token_raw: m.token,
            token_type: m.type,
            label: results[i]?.revoked ? "true_positive" : "false_positive",
          })),
        );
      },
    },
  },
});
