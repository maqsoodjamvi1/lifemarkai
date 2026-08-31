import { test } from "node:test";
import assert from "node:assert/strict";
import { signOAuthState, verifyOAuthState, type OAuthStatePayload } from "./state";

const SECRET = "test-oauth-state-secret";

function payload(overrides: Partial<OAuthStatePayload> = {}): OAuthStatePayload {
  return {
    projectId: "proj_123",
    connector: "github",
    codeVerifier: "abc123verifier",
    nonce: "n0nce",
    issuedAt: 1700000000,
    ...overrides,
  };
}

test("signOAuthState -> verifyOAuthState round-trips the payload", () => {
  const token = signOAuthState(payload(), SECRET);
  const decoded = verifyOAuthState(token, SECRET, { now: 1700000000 });
  assert.deepEqual(decoded, payload());
});

test("verifyOAuthState rejects a token signed with a different secret", () => {
  const token = signOAuthState(payload(), SECRET);
  assert.equal(verifyOAuthState(token, "wrong-secret", { now: 1700000000 }), null);
});

test("verifyOAuthState rejects a tampered payload (e.g. a swapped projectId)", () => {
  const token = signOAuthState(payload(), SECRET);
  const [payloadB64, sig] = token.split(".");
  const decoded = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  decoded.projectId = "someone-elses-project";
  const tamperedB64 = Buffer.from(JSON.stringify(decoded)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const tamperedToken = `${tamperedB64}.${sig}`;
  assert.equal(verifyOAuthState(tamperedToken, SECRET, { now: 1700000000 }), null);
});

test("verifyOAuthState rejects malformed tokens", () => {
  assert.equal(verifyOAuthState("not-a-valid-token", SECRET), null);
  assert.equal(verifyOAuthState("", SECRET), null);
});

test("verifyOAuthState rejects a state older than maxAgeSeconds (replay protection)", () => {
  const token = signOAuthState(payload({ issuedAt: 1700000000 }), SECRET);
  // 20 minutes later, default 10-minute tolerance.
  assert.equal(verifyOAuthState(token, SECRET, { now: 1700000000 + 1200 }), null);
});

test("verifyOAuthState accepts a stale state when maxAgeSeconds is disabled", () => {
  const token = signOAuthState(payload({ issuedAt: 1700000000 }), SECRET);
  const decoded = verifyOAuthState(token, SECRET, { now: 1700000000 + 1200, maxAgeSeconds: 0 });
  assert.equal(decoded?.projectId, "proj_123");
});
