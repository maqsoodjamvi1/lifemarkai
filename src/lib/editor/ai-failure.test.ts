import { describe,it } from "node:test";
import assert from "node:assert/strict";

import { describeAiFailure,readErrorBody } from "./ai-failure.ts";

describe("describeAiFailure", () => {
  // The distinction this whole module exists for: two 402s that mean opposite
  // things. Getting it wrong sends a user to buy credits that cannot help.
  describe("402", () => {
    it("blames the platform when the text names the provider balance", () => {
      const d = describeAiFailure({
        status: 402,
        rawError:
          "Insufficient credits (guard): OpenRouter balance is NEGATIVE ($-0.47) — even free models are blocked.",
      });
      assert.equal(d.isPlatformFault, true);
      assert.match(d.chatMarkdown, /not your account/i);
      assert.match(d.chatMarkdown, /openrouter\.ai\/settings\/credits/);
    });

    it("blames the user's balance when nothing points at the provider", () => {
      const d = describeAiFailure({ status: 402, rawError: "Insufficient credits" });
      assert.equal(d.isPlatformFault, false);
      assert.match(d.chatMarkdown, /you are out of credits/i);
      assert.doesNotMatch(d.chatMarkdown, /openrouter/i);
    });
  });

  // A provider-balance failure arrives as 402, as 500, and mid-stream with no
  // status at all. The answer has to be the same in all three.
  it("recognises the provider balance regardless of how it arrives", () => {
    for (const input of [
      { rawError: "OpenRouter balance too low ($0.10 remaining)" },
      { status: 500, rawError: "Error: OpenRouter balance is NEGATIVE ($-2.00)" },
      { rawError: "Insufficient credits (guard): balance too low" },
    ]) {
      assert.equal(describeAiFailure(input).isPlatformFault, true);
    }
  });

  it("explains the Live lock and how to get out of it", () => {
    const d = describeAiFailure({ status: 423 });
    assert.match(d.chatMarkdown, /Live mode/);
    assert.match(d.chatMarkdown, /Test/);
    assert.match(d.chatMarkdown, /no credits were spent/i);
  });

  it("covers rate limiting, auth and payload size", () => {
    assert.match(describeAiFailure({ status: 429 }).chatMarkdown, /rate limited/i);
    assert.match(describeAiFailure({ status: 401 }).chatMarkdown, /sign in again/i);
    assert.match(describeAiFailure({ status: 403 }).chatMarkdown, /sign in again/i);
    assert.match(describeAiFailure({ status: 413 }).chatMarkdown, /too large/i);
  });

  it("treats any 5xx as transient and worth resending", () => {
    const d = describeAiFailure({ status: 503, rawError: "upstream gone" });
    assert.equal(d.isPlatformFault, true);
    assert.match(d.chatMarkdown, /resend to retry/i);
    assert.ok((d.chatMarkdown).includes("upstream gone"));
  });

  it("treats a dropped builder connection as retryable, not a mystery failure", () => {
    for (const rawError of [
      "Stream idle timeout (180000ms)",
      "Failed to fetch",
      "AI worker not ready: not ready",
      "AI worker unreachable",
    ]) {
      const d = describeAiFailure({ rawError });
      assert.equal(d.isPlatformFault, true);
      assert.match(d.chatMarkdown, /connection to the builder dropped/i);
      assert.doesNotMatch(d.chatMarkdown, /The request failed/);
    }
  });

  it("explains verification-blocked generations without calling them random request failures", () => {
    const d = describeAiFailure({
      rawError:
        "Error: Verification blocked this generation before it replaced your working app: Render bootstrap present: no ReactDOM/createRoot/__Mrequire — app never renders",
    });
    assert.equal(d.isPlatformFault, false);
    assert.match(d.chatMarkdown, /failed verification/i);
    assert.match(d.chatMarkdown, /app was left unchanged/i);
    assert.match(d.chatMarkdown, /app never renders/i);
    assert.doesNotMatch(d.chatMarkdown, /The request failed/);
  });

  // Every branch must promise the message survived, because every branch is
  // paired with a caller that now keeps it.
  it("always tells the user their message is still there", () => {
    for (const input of [
      { status: 402, rawError: "Insufficient credits" },
      { status: 429 },
      { status: 500 },
      { status: 418, rawError: "teapot" },
      { rawError: "OpenRouter balance too low" },
    ]) {
      assert.match(describeAiFailure(input).chatMarkdown, /still (in the thread|here)/i);
    }
  });

  it("falls back to something usable with no status and no text", () => {
    const d = describeAiFailure({});
    assert.ok(d.title);
    assert.ok(d.summary);
    assert.match(d.chatMarkdown, /no changes were made/i);
  });

  it("truncates a huge provider dump instead of pasting it into the thread", () => {
    const d = describeAiFailure({ status: 500, rawError: "x".repeat(5000) });
    assert.ok((d.chatMarkdown.length) < (1200));
    assert.ok((d.chatMarkdown).includes("…"));
  });
});

describe("readErrorBody", () => {
  it("pulls the message out of a JSON error body", async () => {
    const res = new Response(JSON.stringify({ error: "Insufficient credits" }), { status: 402 });
    assert.equal(await readErrorBody(res), "Insufficient credits");
  });

  it("falls back to `message` when that is what the server used", async () => {
    const res = new Response(JSON.stringify({ message: "nope" }), { status: 400 });
    assert.equal(await readErrorBody(res), "nope");
  });

  it("returns plain text bodies as-is", async () => {
    const res = new Response("no available server", { status: 503 });
    assert.equal(await readErrorBody(res), "no available server");
  });

  // It is called on the failure path; it must never become the failure.
  it("never throws on an empty or unreadable body", async () => {
    assert.equal(await readErrorBody(new Response(null, { status: 500 })), "");
    const consumed = new Response("gone", { status: 500 });
    await consumed.text();
    assert.equal(typeof (await readErrorBody(consumed)), "string");
  });

  it("leaves the caller's body readable (clones, does not consume)", async () => {
    const res = new Response(JSON.stringify({ error: "x" }), { status: 402 });
    await readErrorBody(res);
    assert.deepEqual(await res.json(), { error: "x" });
  });
});
