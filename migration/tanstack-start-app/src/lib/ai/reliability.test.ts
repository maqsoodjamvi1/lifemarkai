import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeApiKey } from "./key-hygiene.ts";
import { describeProviderError, toFriendlyProviderError } from "./provider-error.ts";
import { clampHistory, HISTORY_MAX_MESSAGES } from "./context-clamp.ts";
import {
appDataEndpoint,
injectLifemarkDataSdk,
lifemarkDataSdkScript,
} from "../preview/lifemark-data.ts";

// ── #8 key hygiene ────────────────────────────────────────────────────────────

test("sanitizeApiKey strips env-var prefixes, quotes, and whitespace", () => {
  assert.equal(sanitizeApiKey("sk-or-abc123"), "sk-or-abc123");
  assert.equal(sanitizeApiKey("OPENROUTER_API_KEY=sk-or-abc123"), "sk-or-abc123");
  assert.equal(sanitizeApiKey('  "sk-or-abc123"\n'), "sk-or-abc123");
  assert.equal(sanitizeApiKey("openai_api_key = 'sk-abc'"), "sk-abc");
  assert.equal(sanitizeApiKey(""), undefined);
  assert.equal(sanitizeApiKey("   "), undefined);
  assert.equal(sanitizeApiKey(undefined), undefined);
  assert.equal(sanitizeApiKey(null), undefined);
});

// ── #6 friendly provider errors ───────────────────────────────────────────────

test("describeProviderError maps status codes to actionable sentences", () => {
  assert.match(describeProviderError({ status: 401, message: "x" }), /rejected the API key/);
  assert.match(describeProviderError(Object.assign(new Error("nope"), { status: 402 })), /credits exhausted/);
  assert.match(describeProviderError(Object.assign(new Error("nope"), { status: 429 })), /rate limit/);
  assert.match(describeProviderError(new Error("model overloaded")), /overloaded/);
});

test("toFriendlyProviderError keeps the raw error as cause", () => {
  const raw = Object.assign(new Error("upstream detail"), { status: 429 });
  const friendly = toFriendlyProviderError(raw);
  assert.match(friendly.message, /rate limit/);
  assert.equal(friendly.cause, raw);
  assert.equal((friendly as Error & { status?: number }).status, 429);
});

test("toFriendlyProviderError passes unknown errors through unchanged", () => {
  const raw = new Error("some random failure");
  assert.equal(toFriendlyProviderError(raw), raw);
});

// ── #7 context clamp ─────────────────────────────────────────────────────────

test("clampHistory keeps only the last N messages", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `m${i}` }));
  const clamped = clampHistory(history);
  assert.equal(clamped.length, HISTORY_MAX_MESSAGES);
  assert.equal(clamped[clamped.length - 1]!.content, "m19");
});

test("clampHistory truncates oversized messages and marks them", () => {
  const clamped = clampHistory([{ role: "user", content: "x".repeat(10_000) }]);
  assert.ok(clamped[0]!.content.length < 10_000);
  assert.match(clamped[0]!.content, /\[truncated\]$/);
});

test("clampHistory leaves small histories untouched", () => {
  const history = [{ role: "user", content: "hi" }];
  assert.deepEqual(clampHistory(history), history);
});

// ── #3 LifemarkData ──────────────────────────────────────────────────────────

test("appDataEndpoint requires both slug and apiBase", () => {
  assert.equal(appDataEndpoint({}), null);
  assert.equal(appDataEndpoint({ slug: "shop" }), null);
  assert.equal(
    appDataEndpoint({ slug: "shop", apiBase: "https://lifemarkai.app/" }),
    "https://lifemarkai.app/api/public/app-data/shop",
  );
});

test("lifemarkDataSdkScript embeds the endpoint (or null for local mode)", () => {
  assert.match(lifemarkDataSdkScript(), /var E=null/);
  assert.match(
    lifemarkDataSdkScript({ slug: "shop", apiBase: "https://x.dev" }),
    /var E="https:\/\/x\.dev\/api\/public\/app-data\/shop"/,
  );
  assert.match(lifemarkDataSdkScript(), /window\.LifemarkData=/);
});

test("injectLifemarkDataSdk injects into head exactly once", () => {
  const html = "<!doctype html><html><head><title>t</title></head><body></body></html>";
  const once = injectLifemarkDataSdk(html);
  assert.equal((once.match(/data-lifemark-data-sdk/g) ?? []).length, 1);
  const twice = injectLifemarkDataSdk(once);
  assert.equal((twice.match(/data-lifemark-data-sdk/g) ?? []).length, 1);
  assert.ok(once.indexOf("data-lifemark-data-sdk") < once.indexOf("<title>"));
});

test("injectLifemarkDataSdk handles documents without a head", () => {
  const out = injectLifemarkDataSdk("<div>hi</div>");
  assert.match(out, /^<script data-lifemark-data-sdk/);
});
