import { describe,it,beforeEach,afterEach } from "node:test";
import assert from "node:assert/strict";

import {
AiSdkTransportError,
generateViaVercelAiSdk,
isVercelAiSdkAvailable,
resetVercelAiSdkProbe,
} from "./vercel-ai-adapter.ts";

/**
 * These tests hold in BOTH repo states — before `npm install ai @ai-sdk/openai`
 * (probe reports unavailable) and after (probe reports available, and a
 * missing OPENROUTER_API_KEY is the transport error instead). Either way the
 * invariant under test is the same: every pre-request failure is an
 * AiSdkTransportError, the ONLY class the caller may fall back on.
 */
describe("vercel-ai-adapter transport errors", () => {
  let savedKey: string | undefined;
  beforeEach(() => {
    resetVercelAiSdkProbe();
    savedKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env.OPENROUTER_API_KEY = savedKey;
  });

  it("availability probe answers without throwing", async () => {
    const available = await isVercelAiSdkAvailable();
    assert.equal(typeof available, "boolean");
  });

  it("pre-request failures are TRANSPORT errors (the only fallback class)", async () => {
    await assert.rejects(
      () => generateViaVercelAiSdk({ messages: [{ role: "user", content: "hi" }] }),
      (err: unknown) => {
        assert.ok(err instanceof AiSdkTransportError, `got ${String(err)}`);
        // Unavailable SDK → "not installed"; available SDK with no key →
        // "OPENROUTER_API_KEY is not set". Both are pre-request, both fall back.
        assert.match((err as Error).message, /not installed|OPENROUTER_API_KEY/);
        return true;
      },
    );
  });

  it("caches the probe: repeated checks agree", async () => {
    const first = await isVercelAiSdkAvailable();
    const second = await isVercelAiSdkAvailable();
    assert.equal(first, second);
  });
});
