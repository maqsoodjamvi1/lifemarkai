import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parsePaddleSignatureHeader, verifyPaddleSignature } from "./webhook";

const SECRET = "pdl_ntfset_test_secret";

function sign(ts: string, body: string, secret = SECRET): string {
  const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

test("parsePaddleSignatureHeader extracts ts and h1", () => {
  const parsed = parsePaddleSignatureHeader("ts=1700000000;h1=abc123");
  assert.deepEqual(parsed, { ts: "1700000000", h1: "abc123" });
});

test("parsePaddleSignatureHeader returns null for missing/malformed header", () => {
  assert.equal(parsePaddleSignatureHeader(null), null);
  assert.equal(parsePaddleSignatureHeader(""), null);
  assert.equal(parsePaddleSignatureHeader("garbage"), null);
  assert.equal(parsePaddleSignatureHeader("ts=123"), null);
});

test("verifyPaddleSignature accepts a correctly-signed body", () => {
  const now = 1700000000;
  const body = JSON.stringify({ event_type: "subscription.created" });
  const header = sign(String(now), body);
  assert.equal(verifyPaddleSignature(body, header, SECRET, { now }), true);
});

test("verifyPaddleSignature rejects a tampered body", () => {
  const now = 1700000000;
  const body = JSON.stringify({ event_type: "subscription.created" });
  const header = sign(String(now), body);
  const tampered = JSON.stringify({ event_type: "subscription.canceled" });
  assert.equal(verifyPaddleSignature(tampered, header, SECRET, { now }), false);
});

test("verifyPaddleSignature rejects the wrong secret", () => {
  const now = 1700000000;
  const body = "{}";
  const header = sign(String(now), body);
  assert.equal(verifyPaddleSignature(body, header, "wrong secret", { now }), false);
});

test("verifyPaddleSignature rejects a stale timestamp beyond the skew tolerance", () => {
  const signedAt = 1700000000;
  const body = "{}";
  const header = sign(String(signedAt), body);
  // 10 minutes later, default 5-minute tolerance.
  assert.equal(verifyPaddleSignature(body, header, SECRET, { now: signedAt + 600 }), false);
});

test("verifyPaddleSignature accepts a stale timestamp when skew checking is disabled", () => {
  const signedAt = 1700000000;
  const body = "{}";
  const header = sign(String(signedAt), body);
  assert.equal(
    verifyPaddleSignature(body, header, SECRET, { now: signedAt + 600, maxSkewSeconds: 0 }),
    true,
  );
});

test("verifyPaddleSignature returns false for a missing or empty secret", () => {
  const header = sign("1700000000", "{}");
  assert.equal(verifyPaddleSignature("{}", header, "", { now: 1700000000 }), false);
});
