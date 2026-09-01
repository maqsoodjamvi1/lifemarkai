/**
 * Signed `state` parameter for the managed connector OAuth flow.
 *
 * The redirect round-trip through the provider is the only way to carry
 * data from /start to /callback without a server-side session store, so the
 * state param itself carries { projectId, connector, codeVerifier, nonce,
 * issuedAt } — HMAC-signed so a caller can't forge a different projectId
 * (which would let them attach their own OAuth token to someone else's
 * project) or replay a stale one. None of this payload is secret (the
 * PKCE code_verifier is designed to be sent over the wire to the token
 * endpoint anyway), so signing rather than encrypting is sufficient — the
 * property that matters is tamper-evidence and expiry, not confidentiality.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface OAuthStatePayload {
  projectId: string;
  connector: string;
  codeVerifier: string;
  nonce: string;
  issuedAt: number; // unix seconds
  // The user who called /start. Unlike projectId (protected by re-checking
  // the *completing* user's access at /callback), a project can have
  // multiple collaborators with write access — so binding state to a
  // specific projectId alone doesn't stop one collaborator from crafting an
  // authorize link and having ANOTHER collaborator complete it with their
  // own account, planting that other user's OAuth token into the project.
  // /callback must reject any state whose userId doesn't match the
  // authenticated completer, the same fix already applied to the
  // account-level gateway OAuth flow (src/lib/oauth/gateway-state.ts).
  userId: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(payloadB64: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(payloadB64).digest());
}

export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/**
 * Verifies and decodes a state token. Returns null on any tamper, malformed
 * input, or (when maxAgeSeconds > 0) an issuedAt older than the allowed
 * window — a stale state most likely means the browser sat on the provider's
 * consent screen far too long, or someone is replaying an old redirect.
 */
export function verifyOAuthState(
  token: string,
  secret: string,
  opts: { maxAgeSeconds?: number; now?: number } = {},
): OAuthStatePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(payloadB64, secret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(sig);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(fromBase64url(payloadB64));
  } catch {
    return null;
  }
  if (
    !payload.projectId ||
    !payload.connector ||
    !payload.codeVerifier ||
    !payload.nonce ||
    !payload.issuedAt ||
    !payload.userId
  ) {
    return null;
  }

  const { maxAgeSeconds = 10 * 60, now = Math.floor(Date.now() / 1000) } = opts;
  if (maxAgeSeconds > 0 && now - payload.issuedAt > maxAgeSeconds) return null;

  return payload;
}
