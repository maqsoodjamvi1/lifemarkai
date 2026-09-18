import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ISOLATION_NETWORK,
  registryEgressReady,
  sandboxEgressMode,
  sandboxIsolationHostConfig,
  sandboxIsolationLabels,
  sandboxIsolationNetworkCreateBody,
  sandboxIsolationNetworkName,
  sandboxJobId,
  sandboxNpmInstallEnv,
} from "./isolation-policy.ts";

test("default egress stays allow so existing Traefik previews keep working", () => {
  assert.equal(sandboxEgressMode({}), "allow");
  assert.equal(sandboxEgressMode({ SANDBOX_EGRESS: "registry" }), "registry");
  assert.equal(sandboxEgressMode({ SANDBOX_EGRESS: "deny" }), "registry");
  assert.equal(sandboxIsolationNetworkName({}), DEFAULT_ISOLATION_NETWORK);
});

test("registry mode refuses to boot without a package proxy", () => {
  assert.deepEqual(registryEgressReady({ SANDBOX_EGRESS: "registry" }), {
    ok: false,
    error:
      "SANDBOX_EGRESS=registry requires SANDBOX_NPM_REGISTRY (a job-local package proxy). Refusing to boot with open egress.",
  });
  assert.deepEqual(registryEgressReady({ SANDBOX_EGRESS: "registry", SANDBOX_NPM_REGISTRY: "http://npm-proxy:4873" }), {
    ok: true,
  });
  assert.deepEqual(sandboxNpmInstallEnv({ SANDBOX_NPM_REGISTRY: "http://npm-proxy:4873" }), [
    "npm_config_registry=http://npm-proxy:4873",
  ]);
});

test("isolation host config drops privileges and never mounts a shared cache", () => {
  const host = sandboxIsolationHostConfig({ memoryMb: 1024, cpus: 1, pidsLimit: 512 });
  assert.equal(host.Memory, 1024 * 1024 * 1024);
  assert.equal(host.MemorySwap, host.Memory);
  assert.deepEqual(host.CapDrop, ["ALL"]);
  assert.deepEqual(host.SecurityOpt, ["no-new-privileges"]);
  assert.deepEqual(host.Binds, []);
  assert.equal(host.Tmpfs["/tmp"]?.includes("noexec"), true);
  assert.equal(host.PidsLimit, 512);
});

test("job labels are unique per attempt and never share a writable handle", () => {
  const labels = sandboxIsolationLabels({
    projectId: "proj-1",
    attemptId: "att_aaa",
    buildRunId: "run_bbb",
    requestId: "req_ccc",
  });
  assert.equal(labels["lifemark.job-id"], "att_aaa");
  assert.equal(labels["lifemark.attempt"], "att_aaa");
  assert.equal(sandboxJobId({ projectId: "proj-1" }), "proj-1");
  const body = sandboxIsolationNetworkCreateBody("lifemark-sandboxes", true);
  assert.equal(body.Internal, true);
  assert.equal(body.Driver, "bridge");
});
