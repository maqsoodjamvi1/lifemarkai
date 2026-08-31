/**
 * PKCE (RFC 7636) helpers for the managed connector OAuth flow
 * (src/routes/api/connectors/oauth/{start,callback}.ts).
 *
 * Pure/no I/O so this is directly unit-testable without a real OAuth
 * provider — the correctness that matters here (code_verifier -> S256
 * code_challenge) is exactly the part a live-provider test can't add
 * confidence to anyway, since it never leaves this process.
 */
import { randomBytes, createHash } from "node:crypto";

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 43-128 char unreserved-character string per RFC 7636 §4.1. */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32)); // 32 bytes -> 43-char base64url string
}

/** S256 code_challenge for a given verifier, per RFC 7636 §4.2. */
export function codeChallengeFromVerifier(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}
