/**
 * Preview tokens — short-lived, project-scoped JWTs that gate the cross-origin
 * preview host. LifemarkAI's own design (inspired by, not copied from, the
 * general "signed preview URL" pattern):
 *
 *   GET /preview/<projectId>?token=<jwt>&sha=<build>
 *
 * The token is minted server-side by /api/preview/token after an access check,
 * then verified by the preview serve route before any project files are
 * returned. This closes the previous hole where anyone with a project id could
 * read its preview.
 *
 * Signing algorithm is chosen from env, with NO extra dependency (native
 * `crypto`):
 *   - RS256 when PREVIEW_JWT_PRIVATE_KEY (+ PREVIEW_JWT_PUBLIC_KEY to verify)
 *   - HS256 when PREVIEW_JWT_SECRET
 * Server-only module — never import into client code.
 */

import crypto from "crypto";

const ISS = "lifemarkai-preview";
const AUD = "lifemarkai-app";

export interface PreviewTokenClaims {
  project_id: string;
  user_id: string;
  access_type: "project";
  /** Build/commit hash this token was minted for (advisory). */
  sha?: string;
  iss: string;
  aud: string[];
  sub: string;
  iat: number;
  nbf: number;
  exp: number;
}

function pem(v: string | undefined): string | undefined {
  // Env vars often store PEM keys with literal "\n" — restore real newlines.
  return v ? v.replace(/\\n/g, "\n") : undefined;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function ttlSeconds(): number {
  const raw = Number(process.env.PREVIEW_TOKEN_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 86_400; // default 24h
}

type Alg = "RS256" | "HS256";

/**
 * HS256 secret: prefer PREVIEW_JWT_SECRET; otherwise derive a stable secret from
 * SUPABASE_SERVICE_ROLE_KEY so production doesn't 501 when the dedicated env
 * was never set. Derived (never the raw service-role key as HMAC material).
 */
function hsSecret(): string | undefined {
  if (process.env.PREVIEW_JWT_SECRET) return process.env.PREVIEW_JWT_SECRET;
  const seed = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!seed) return undefined;
  return crypto.createHash("sha256").update(`lifemarkai-preview:${seed}`).digest("hex");
}

function signingAlg(): Alg | null {
  if (pem(process.env.PREVIEW_JWT_PRIVATE_KEY)) return "RS256";
  if (hsSecret()) return "HS256";
  return null;
}

function verifyingAlg(): Alg | null {
  if (pem(process.env.PREVIEW_JWT_PUBLIC_KEY)) return "RS256";
  if (hsSecret()) return "HS256";
  return null;
}

/** True when the environment can mint/verify preview tokens. */
export function previewTokenConfigured(): boolean {
  return signingAlg() !== null && verifyingAlg() !== null;
}

function makeSignature(alg: Alg, signingInput: string): string {
  if (alg === "RS256") {
    const key = pem(process.env.PREVIEW_JWT_PRIVATE_KEY)!;
    return crypto.createSign("RSA-SHA256").update(signingInput).sign(key, "base64url");
  }
  const secret = hsSecret()!;
  return crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
}

/** Mint a signed preview token. Returns null when signing keys aren't set. */
export function signPreviewToken(input: {
  projectId: string;
  userId: string;
  sha?: string;
}): { token: string; expiresAt: number } | null {
  const alg = signingAlg();
  if (!alg) return null;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds();
  const claims: PreviewTokenClaims = {
    project_id: input.projectId,
    user_id: input.userId,
    access_type: "project",
    sha: input.sha,
    iss: ISS,
    aud: [AUD],
    sub: input.projectId,
    iat: now,
    nbf: now,
    exp,
  };

  const header = b64url(JSON.stringify({ alg, typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = makeSignature(alg, signingInput);
  return { token: `${signingInput}.${signature}`, expiresAt: exp };
}

/** Verify a preview token. Returns claims on success, null on any failure. */
export function verifyPreviewToken(token: string): PreviewTokenClaims | null {
  const alg = verifyingAlg();
  if (!alg) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const signingInput = `${header}.${payload}`;

  try {
    if (alg === "RS256") {
      const key = pem(process.env.PREVIEW_JWT_PUBLIC_KEY)!;
      const ok = crypto
        .createVerify("RSA-SHA256")
        .update(signingInput)
        .verify(key, Buffer.from(signature, "base64url"));
      if (!ok) return null;
    } else {
      const secret = hsSecret()!;
      const expected = crypto.createHmac("sha256", secret).update(signingInput).digest();
      const got = Buffer.from(signature, "base64url");
      if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) {
        return null;
      }
    }

    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PreviewTokenClaims;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== ISS) return null;
    if (!Array.isArray(claims.aud) || !claims.aud.includes(AUD)) return null;
    if (typeof claims.exp !== "number" || claims.exp < now) return null;
    if (typeof claims.nbf === "number" && claims.nbf > now + 60) return null;
    if (!claims.project_id) return null;
    return claims;
  } catch {
    return null;
  }
}
