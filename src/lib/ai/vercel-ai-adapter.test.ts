import { describe,it,beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
AiSdkTransportError,
generateViaVercelAiSdk,
isVercelAiSdkAvailable,
resetVercelAiSdkProbe,
} from "./vercel-ai-adapter.ts";

describe("vercel-ai-adapter without the SDK installed (this repo, today)", () => {
  beforeEach(() => resetVercelAiSdkProbe());

  it("reports unavailable instead of throwing", async () => {
    assert.equal(await isVercelAiSdkAvailable(), false);
  });

  it("throws a TRANSPORT error (the only error class the caller may fall back on)", async () => {
    await assert.rejects(
      () => generateViaVercelAiSdk({ messages: [{ role: "user", content: "hi" }] }),
      (err: unknown) => {
        assert.ok(err instanceof AiSdkTransportError);
        assert.match((err as Error).message, /not installed/);
        return true;
      },
    );
  });

  it("caches the probe: repeated checks do not re-import", async () => {
    const first = await isVercelAiSdkAvailable();
    const second = await isVercelAiSdkAvailable();
    assert.equal(first, second);
  });
});
