import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWED_SANDBOX_EGRESS_HOSTS,
  assertSandboxStorageIsolation,
  detectAnomalousSandboxProbe,
  isAllowedSandboxEgressHost,
  redactSandboxOutput,
  sandboxIsolationPolicy,
} from "./sandbox-boundary.ts";

test("per-project credentials never share volumes, caches, or sibling filesystems", () => {
  const policy = sandboxIsolationPolicy("proj-42");
  assert.equal(policy.labels["lifemark.credential-scope"], "proj-42");
  assert.equal(policy.labels["lifemark.isolation"], "per-project");
  assert.deepEqual(policy.binds, []);
  assert.deepEqual(policy.volumesFrom, []);
  assert.deepEqual(assertSandboxStorageIsolation({ Binds: [], VolumesFrom: [] }), []);
  assert.ok(assertSandboxStorageIsolation({ Binds: ["/var/npm-cache:/cache"] }).length > 0);
  assert.ok(assertSandboxStorageIsolation({ VolumesFrom: ["other-sandbox"] }).length > 0);
});

test("package mirrors and preview hosts are allowlisted; metadata and docker.sock are not", () => {
  assert.ok(isAllowedSandboxEgressHost("registry.npmjs.org"));
  assert.ok(isAllowedSandboxEgressHost("my-app.previews.example.com", "previews.example.com"));
  assert.equal(isAllowedSandboxEgressHost("169.254.169.254"), false);
  assert.equal(isAllowedSandboxEgressHost("metadata.google.internal"), false);
  assert.ok(ALLOWED_SANDBOX_EGRESS_HOSTS.includes("registry.npmjs.org"));
});

test("redacts secrets and terminates sandboxes that probe shared services", () => {
  const redacted = redactSandboxOutput("OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789 TOKEN=ghp_abcdefghijklmnopqrstuvwxyz012345");
  assert.equal(redacted.includes("sk-abcdefghijklmnopqrstuvwxyz0123456789"), false);
  assert.equal(redacted.includes("ghp_abcdefghijklmnopqrstuvwxyz012345"), false);
  assert.equal(detectAnomalousSandboxProbe("curl http://169.254.169.254/latest/meta-data").shouldTerminate, true);
  assert.equal(detectAnomalousSandboxProbe("cat /var/run/docker.sock").shouldTerminate, true);
  assert.equal(detectAnomalousSandboxProbe("npm config set registry http://10.0.0.8:4873").shouldTerminate, true);
  assert.equal(detectAnomalousSandboxProbe("vite ready in 320 ms").shouldTerminate, false);
});
