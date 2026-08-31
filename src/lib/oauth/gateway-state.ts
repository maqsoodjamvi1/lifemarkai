/**
 * Signed `state` parameter for the platform-level "connector gateway" OAuth
 * flow (src/routes/api/oauth/{start,callback}/$connector.ts).
 *
 * This is a sibling of src/lib/oauth/state.ts, not a reuse of it, because the
 * two flows carry different payloads: the managed-connector flow in state.ts
 * is per-project and always PKCE (it carries projectId + codeVerifier); this
 * gateway flow connects a third-party account to the signed-in platform user
 * directly (no project, no PKCE — slack/google/hubspot's authorization-code
 * exchange here is a confidential-client server-to-server call, so PKCE adds
 * nothing) and additionally binds the state to the user id that started the
 * flow, so the callback can refuse to attach a token to a different session
 * than the one that requested it.
 *
 * Before this module existed, /api/oauth/callback/$connector.ts had no state
 * parameter at all: a code obtained through any means (e.g. an attacker's own
 * OAuth consent, or a stolen authorization code) could be handed to a victim
 * via a crafted callback URL and would silently upsert into the victim's own
 * oauth_tokens row — a classic OAuth login/connect CSRF. Signing+verifying a
 * state that's bound to both the connector and the initiating user closes
 * that: the callback now requires a state that was minted by /start for this
 * exact user and connector, so a code sourced from anywhere else is rejected
 * before any token exchange happens.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface GatewayOAuthStatePayload {
  connector: string;
  userId: string;
  nonce: string;
  issuedAt: number; // unix seconds
  /** Path (same-origin, no scheme/host) to send the user back to after connect. */
  returnTo: string;
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

export function signGatewayOAuthState(payload: GatewayOAuthStatePayload, secret: string): string {
  const payloadB64 = base64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verifies and decodes a gateway state token. Returns null on any tamper,
 * malformed input, or an issuedAt older than the allowed window.
 */
export function verifyGatewayOAuthState(
  token: string,
  secret: string,
  opts: { maxAgeSeconds?: number; now?: number } = {},
): GatewayOAuthStatePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(payloadB64, secret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(sig);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) return null;

  let payload: GatewayOAuthStatePayload;
  try {
    payload = JSON.parse(fromBase64url(payloadB64));
  } catch {
    return null;
  }
  if (!payload.connector || !payload.userId || !payload.nonce || !payload.issuedAt || typeof payload.returnTo !== "string") {
    return null;
  }
  // returnTo must stay a same-origin path — never let a signed state carry an
  // absolute/external URL out through the callback's redirect.
  if (!payload.returnTo.startsWith("/") || payload.returnTo.startsWith("//")) return null;

  const { maxAgeSeconds = 10 * 60, now = Math.floor(Date.now() / 1000) } = opts;
  if (maxAgeSeconds > 0 && now - payload.issuedAt > maxAgeSeconds) return null;

  return payload;
}
