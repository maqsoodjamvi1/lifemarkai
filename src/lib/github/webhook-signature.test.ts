import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeWebhookSignature,
  signaturesMatch,
  findMatchingWebhookSecret,
} from "./webhook-signature";

test("computeWebhookSignature produces the sha256= prefixed hex GitHub sends", () => {
  const sig = computeWebhookSignature("s3cret", "{\"ref\":\"refs/heads/main\"}");
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
});

test("computeWebhookSignature is deterministic for the same secret+body", () => {
  const a = computeWebhookSignature("s3cret", "body");
  const b = computeWebhookSignature("s3cret", "body");
  assert.equal(a, b);
});

test("computeWebhookSignature differs when the body changes", () => {
  const a = computeWebhookSignature("s3cret", "body-one");
  const b = computeWebhookSignature("s3cret", "body-two");
  assert.notEqual(a, b);
});

test("signaturesMatch is true for identical signatures", () => {
  const sig = computeWebhookSignature("s3cret", "payload");
  assert.equal(signaturesMatch(sig, sig), true);
});

test("signaturesMatch is false for a wrong secret", () => {
  const expected = computeWebhookSignature("s3cret", "payload");
  const actual = computeWebhookSignature("wrong-secret", "payload");
  assert.equal(signaturesMatch(expected, actual), false);
});

test("signaturesMatch is false when lengths differ (never throws)", () => {
  assert.equal(signaturesMatch("sha256=abc", "sha256=abcdef"), false);
});

test("findMatchingWebhookSecret returns the project whose secret verifies", () => {
  const rawBody = "{\"ref\":\"refs/heads/main\"}";
  const header = computeWebhookSignature("secret-b", rawBody);
  const candidates = [
    { id: "proj-a", github_webhook_secret: "secret-a" },
    { id: "proj-b", github_webhook_secret: "secret-b" },
    { id: "proj-c", github_webhook_secret: "secret-c" },
  ];
  const match = findMatchingWebhookSecret(candidates, rawBody, header);
  assert.equal(match?.id, "proj-b");
});

test("findMatchingWebhookSecret returns undefined when no candidate's secret verifies", () => {
  const rawBody = "payload";
  const header = computeWebhookSignature("unrelated-secret", rawBody);
  const candidates = [
    { id: "proj-a", github_webhook_secret: "secret-a" },
    { id: "proj-b", github_webhook_secret: "secret-b" },
  ];
  assert.equal(findMatchingWebhookSecret(candidates, rawBody, header), undefined);
});

test("findMatchingWebhookSecret skips candidates with no secret set yet", () => {
  const rawBody = "payload";
  const header = computeWebhookSignature("secret-b", rawBody);
  const candidates = [
    { id: "proj-a", github_webhook_secret: null },
    { id: "proj-b", github_webhook_secret: "secret-b" },
  ];
  const match = findMatchingWebhookSecret(candidates, rawBody, header);
  assert.equal(match?.id, "proj-b");
});

test("findMatchingWebhookSecret returns undefined for an empty candidate list", () => {
  const rawBody = "payload";
  const header = computeWebhookSignature("secret", rawBody);
  assert.equal(findMatchingWebhookSecret([], rawBody, header), undefined);
});
