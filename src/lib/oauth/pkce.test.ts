import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateCodeVerifier, codeChallengeFromVerifier } from "./pkce";

test("generateCodeVerifier produces a URL-safe string in the RFC 7636 length range", () => {
  const v = generateCodeVerifier();
  assert.ok(v.length >= 43 && v.length <= 128, `expected 43-128 chars, got ${v.length}`);
  assert.match(v, /^[A-Za-z0-9_-]+$/);
});

test("generateCodeVerifier produces different values each call", () => {
  const a = generateCodeVerifier();
  const b = generateCodeVerifier();
  assert.notEqual(a, b);
});

test("codeChallengeFromVerifier is the base64url(SHA256(verifier)) per RFC 7636 §4.2", () => {
  const verifier = "test-verifier-value-1234567890abcdefghijk";
  const expected = createHash("sha256").update(verifier).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(codeChallengeFromVerifier(verifier), expected);
});

test("codeChallengeFromVerifier is deterministic for the same verifier", () => {
  const verifier = generateCodeVerifier();
  assert.equal(codeChallengeFromVerifier(verifier), codeChallengeFromVerifier(verifier));
});
