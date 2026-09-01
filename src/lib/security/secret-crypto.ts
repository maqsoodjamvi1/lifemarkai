/**
 * Encryption for project_secrets.value_enc (and any similarly stored
 * per-project credential).
 *
 * Replaces a repeating-key XOR "cipher" that was duplicated in
 * routes/api/projects/$id/secrets.ts and .../secrets/$secretId.ts — XOR
 * with a fixed key is trivially broken by crib-dragging once an attacker
 * knows or guesses any plaintext fragment (predictable for API keys like
 * "sk-..."/"sk_live_..."), which recovers the shared key and then every
 * other secret encrypted with it. It also silently fell back to a
 * hardcoded literal ("lifemarkai-default-key-32chars!!", committed in the
 * repo) whenever SECRETS_ENCRYPTION_KEY wasn't set, so an unconfigured
 * deployment was protecting secrets with a key anyone reading this source
 * file already has.
 *
 * New writes use AES-256-GCM (authenticated encryption — tamper-evident,
 * not just confidentiality) with a key derived from SECRETS_ENCRYPTION_KEY
 * via SHA-256 (so the env var doesn't need to be exactly 32 bytes). Unlike
 * the old code, encrypt() REQUIRES the env var to be set and throws rather
 * than falling back to a hardcoded key — the same fail-closed choice this
 * codebase already makes for OAUTH_STATE_SECRET (see
 * routes/api/oauth/start/$connector.ts).
 *
 * Backward compatibility: rows written by the old code are plain base64
 * with no prefix; new rows are prefixed "v2:". decrypt() checks for that
 * prefix and falls back to the legacy XOR scheme for un-prefixed values,
 * so existing secrets keep working without a data migration this
 * environment has no way to run against the live database. Legacy
 * decryption still needs the hardcoded fallback key available (for rows
 * that were written when SECRETS_ENCRYPTION_KEY was unset) — that key is
 * ONLY ever used for reading old-format data, never for producing new
 * ciphertext. Rotating a secret (PATCH with a new value) upgrades that row
 * to v2 automatically, since any write goes through encrypt().
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const LEGACY_FALLBACK_KEY = "lifemarkai-default-key-32chars!!";
const V2_PREFIX = "v2:";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/** Encrypt a secret value for storage. Throws if SECRETS_ENCRYPTION_KEY isn't set. */
export function encryptSecret(value: string): string {
  const envKey = process.env.SECRETS_ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY is not configured on this deployment — project secrets cannot be stored until it's set.",
    );
  }
  const key = deriveKey(envKey);
  const iv = randomBytes(12); // 96-bit nonce, standard for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv (12) + authTag (16) + ciphertext, all base64'd together after a
  // version prefix so decrypt() can tell this apart from a legacy value at
  // a glance without touching the crypto key.
  const packed = Buffer.concat([iv, authTag, ciphertext]).toString("base64");
  return `${V2_PREFIX}${packed}`;
}

function legacyXorDecrypt(enc: string): string {
  const key = process.env.SECRETS_ENCRYPTION_KEY ?? LEGACY_FALLBACK_KEY;
  const bytes = Buffer.from(enc, "base64");
  return Array.from(bytes)
    .map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length)))
    .join("");
}

/** Decrypt a value_enc column. Handles both v2 (AES-GCM) and legacy (XOR) rows. */
export function decryptSecret(enc: string): string {
  if (!enc.startsWith(V2_PREFIX)) return legacyXorDecrypt(enc);

  const envKey = process.env.SECRETS_ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY is not configured on this deployment — this secret was encrypted with a key that must be provided to read it back.",
    );
  }
  const key = deriveKey(envKey);
  const packed = Buffer.from(enc.slice(V2_PREFIX.length), "base64");
  const iv = packed.subarray(0, 12);
  const authTag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
