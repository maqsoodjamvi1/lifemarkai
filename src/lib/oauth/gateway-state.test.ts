import { test } from "node:test";
import assert from "node:assert/strict";
import { signGatewayOAuthState, verifyGatewayOAuthState, type GatewayOAuthStatePayload } from "./gateway-state";

const SECRET = "test-gateway-state-secret";

function payload(overrides: Partial<GatewayOAuthStatePayload> = {}): GatewayOAuthStatePayload {
  return {
    connector: "slack",
    userId: "user_123",
    nonce: "n0nce",
    issuedAt: 1700000000,
    returnTo: "/project/proj_abc",
    ...overrides,
  };
}

test("signGatewayOAuthState -> verifyGatewayOAuthState round-trips the payload", () => {
  const token = signGatewayOAuthState(payload(), SECRET);
  const decoded = verifyGatewayOAuthState(token, SECRET, { now: 1700000000 });
  assert.deepEqual(decoded, payload());
});

test("rejects a token signed with a different secret", () => {
  const token = signGatewayOAuthState(payload(), SECRET);
  assert.equal(verifyGatewayOAuthState(token, "wrong-secret", { now: 1700000000 }), null);
});

test("rejects a tampered payload (e.g. a swapped userId — the CSRF case)", () => {
  const token = signGatewayOAuthState(payload(), SECRET);
  const [payloadB64, sig] = token.split(".");
  const decoded = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  decoded.userId = "victim_456";
  const tamperedB64 = Buffer.from(JSON.stringify(decoded)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const tamperedToken = `${tamperedB64}.${sig}`;
  assert.equal(verifyGatewayOAuthState(tamperedToken, SECRET, { now: 1700000000 }), null);
});

test("rejects malformed tokens", () => {
  assert.equal(verifyGatewayOAuthState("not-a-valid-token", SECRET), null);
  assert.equal(verifyGatewayOAuthState("", SECRET), null);
});

test("rejects a state older than maxAgeSeconds (replay protection)", () => {
  const token = signGatewayOAuthState(payload({ issuedAt: 1700000000 }), SECRET);
  assert.equal(verifyGatewayOAuthState(token, SECRET, { now: 1700000000 + 1200 }), null);
});

test("accepts a stale state when maxAgeSeconds is disabled", () => {
  const token = signGatewayOAuthState(payload({ issuedAt: 1700000000 }), SECRET);
  const decoded = verifyGatewayOAuthState(token, SECRET, { now: 1700000000 + 1200, maxAgeSeconds: 0 });
  assert.equal(decoded?.userId, "user_123");
});

test("rejects a returnTo that isn't a same-origin path (open-redirect guard)", () => {
  const token1 = signGatewayOAuthState(payload({ returnTo: "https://evil.example/phish" }), SECRET);
  assert.equal(verifyGatewayOAuthState(token1, SECRET, { now: 1700000000 }), null);
  const token2 = signGatewayOAuthState(payload({ returnTo: "//evil.example/phish" }), SECRET);
  assert.equal(verifyGatewayOAuthState(token2, SECRET, { now: 1700000000 }), null);
});

test("round-trips githubHost for GitHub Enterprise OAuth", () => {
  const token = signGatewayOAuthState(
    payload({ connector: "github", githubHost: "https://github.acme.internal" }),
    SECRET,
  );
  const decoded = verifyGatewayOAuthState(token, SECRET, { now: 1700000000 });
  assert.equal(decoded?.githubHost, "https://github.acme.internal");
});

test("rejects a githubHost that is not an https origin", () => {
  const token = signGatewayOAuthState(
    payload({ connector: "github", githubHost: "http://github.acme.internal" }),
    SECRET,
  );
  assert.equal(verifyGatewayOAuthState(token, SECRET, { now: 1700000000 }), null);
});
