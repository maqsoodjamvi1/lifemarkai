import assert from "node:assert/strict";
import test from "node:test";

// preview-token.ts reads its keys from process.env at call time, so each
// test mutates env directly and restores it afterward rather than mocking a
// module. Re-imported fresh per test isn't necessary — every exported
// function re-reads process.env on every call, by design.
const ENV_KEYS = [
  "PREVIEW_JWT_PRIVATE_KEY",
  "PREVIEW_JWT_PUBLIC_KEY",
  "PREVIEW_JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

async function withEnv(
  vars: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  fn: () => void | Promise<void>,
) {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, vars);
  try {
    await fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

// Regression: signPreviewToken minted RS256 tokens whenever the private key
// alone was set, while verifyPreviewToken only chose RS256 when the public
// key alone was set (else falling back to HS256, keyed off
// SUPABASE_SERVICE_ROLE_KEY, which is present in basically every real
// deployment). An operator who set only PREVIEW_JWT_PRIVATE_KEY got every
// preview token minted as RS256 and rejected on verification as HS256 —
// 100% of preview access broken, with previewTokenConfigured() still
// reporting true since both algorithm-selection functions independently
// returned non-null.
test("signing and verifying never diverge when only one RS256 key is set", async () => {
  await withEnv(
    {
      PREVIEW_JWT_PRIVATE_KEY: "not-a-real-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-seed",
    },
    async () => {
      const { signPreviewToken, verifyPreviewToken, previewTokenConfigured } = await import(
        "./preview-token.ts"
      );
      // Both must fall back to HS256 together (private key alone can't sign
      // AND verify RS256 - only PUBLIC key material can verify).
      assert.equal(previewTokenConfigured(), true);
      const signed = signPreviewToken({ projectId: "p1", userId: "u1" });
      assert.ok(signed, "should still be able to sign via the HS256 fallback");
      const claims = verifyPreviewToken(signed!.token);
      assert.ok(claims, "a token minted with the fallback algorithm must verify with the same one");
      assert.equal(claims!.project_id, "p1");
    },
  );
});

test("RS256 is only chosen when both private and public keys are present", async () => {
  await withEnv(
    {
      PREVIEW_JWT_PRIVATE_KEY: "priv-only",
      // no PREVIEW_JWT_PUBLIC_KEY, no SUPABASE_SERVICE_ROLE_KEY fallback
    },
    async () => {
      const { previewTokenConfigured, signPreviewToken } = await import("./preview-token.ts");
      assert.equal(previewTokenConfigured(), false);
      assert.equal(signPreviewToken({ projectId: "p1", userId: "u1" }), null);
    },
  );
});

test("HS256 round-trips normally when only the derived service-role secret is available", async () => {
  await withEnv({ SUPABASE_SERVICE_ROLE_KEY: "some-service-role-key" }, async () => {
    const { signPreviewToken, verifyPreviewToken } = await import("./preview-token.ts");
    const signed = signPreviewToken({ projectId: "proj-abc", userId: "user-1", sha: "deadbeef" });
    assert.ok(signed);
    const claims = verifyPreviewToken(signed!.token);
    assert.ok(claims);
    assert.equal(claims!.project_id, "proj-abc");
    assert.equal(claims!.sha, "deadbeef");
  });
});
