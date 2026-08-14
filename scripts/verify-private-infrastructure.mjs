import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

function loadEnv(path = ".env.local") {
  try {
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Shell/CI configuration is also supported.
  }
}

function hasGroup(group) {
  return group.every((key) => Boolean(process.env[key]?.trim()));
}

function runNode(args, label) {
  const child = spawn(process.execPath, args, {
    env: process.env,
    stdio: "inherit",
  });
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${label} stopped by ${signal}`));
      else resolvePromise(code ?? 1);
    });
  });
}

function runBehavioralContracts() {
  return runNode(
    [
      "--import",
      "tsx",
      "--test",
      "src/lib/infrastructure/private-behavioral-contracts.test.ts",
    ],
    "behavioral contracts",
  );
}

function runCoreLoop() {
  return runNode(
    ["scripts/verify-core-loop-one-flow.mjs"],
    "core loop",
  );
}

async function main() {
  loadEnv();
  const strict = process.argv.includes("--strict");
  const run = process.argv.includes("--run-core-loop");
  const manifest = JSON.parse(
    readFileSync(resolve("config/private-infrastructure.json"), "utf8"),
  );

  const behavioralContractsPassed = (await runBehavioralContracts()) === 0;
  const results = manifest.capabilities.map((capability) => {
    const implementationComplete = capability.status === "implemented";
    const configured =
      !capability.anyEnv ||
      capability.anyEnv.length === 0 ||
      capability.anyEnv.some(hasGroup);
    return {
      id: capability.id,
      label: capability.label,
      behaviorallyVerified: behavioralContractsPassed,
      implementationComplete,
      configured,
      blocker: capability.blocker ?? null,
      acceptedEnvironmentGroups: capability.anyEnv ?? [],
    };
  });

  const incomplete = results.filter((result) => !result.implementationComplete);
  const unconfigured = results.filter((result) => !result.configured);
  for (const result of results) {
    const state = !result.behaviorallyVerified
      ? "CONTRACT_FAILED"
      : !result.implementationComplete
        ? "INCOMPLETE"
        : !result.configured
          ? "NEEDS_CONFIG"
          : "READY";
    console.log(`${state.padEnd(16)} ${result.id.padEnd(22)} ${result.label}`);
  }

  const ready =
    behavioralContractsPassed &&
    incomplete.length === 0 &&
    (!strict || unconfigured.length === 0);
  const report = {
    version: manifest.version,
    behavioralContract: manifest.behavioralContract,
    checkedAt: new Date().toISOString(),
    strict,
    behavioralContractsPassed,
    implementationComplete: incomplete.length === 0,
    productionConfigured: unconfigured.length === 0,
    ready,
    results,
  };
  console.log(JSON.stringify(report, null, 2));

  if (!ready) process.exitCode = 1;
  if (run && ready) {
    const code = await runCoreLoop();
    if (code !== 0) process.exitCode = code;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
