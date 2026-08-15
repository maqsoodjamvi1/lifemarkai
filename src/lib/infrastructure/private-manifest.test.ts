import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type Capability = {
  id: string;
  label: string;
  status: "implemented" | "partial";
  anyEnv?: string[][];
};

const manifest = JSON.parse(
  readFileSync("config/private-infrastructure.json", "utf8"),
) as {
  version: number;
  behavioralContract: string;
  capabilities: Capability[];
};

test("private infrastructure manifest covers every required capability once", () => {
  assert.equal(manifest.version, 2);
  assert.equal(
    manifest.behavioralContract,
    "src/lib/infrastructure/private-behavioral-contracts.test.ts",
  );
  assert.equal(manifest.capabilities.length, 18);
  const ids = manifest.capabilities.map((capability) => capability.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const capability of manifest.capabilities) {
    assert.ok(capability.label.length > 0);
    assert.equal(capability.status, "implemented");
  }
});

test("production-critical external services require configuration", () => {
  const required = [
    "ai_gateway",
    "sandbox",
    "queues",
    "cloud_database",
    "deployment",
    "billing",
    "observability",
    "backup_recovery",
  ];
  for (const id of required) {
    const capability = manifest.capabilities.find((entry) => entry.id === id);
    assert.ok(capability, `missing ${id}`);
    assert.ok((capability.anyEnv?.length ?? 0) > 0, `${id} has no configuration gate`);
  }
});
