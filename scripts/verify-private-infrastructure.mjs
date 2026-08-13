import { existsSync, readFileSync } from "node:fs";
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

async function runCoreLoop() {
  const child = spawn(process.execPath, ["scripts/verify-core-loop-one-flow.mjs"], {
    env: process.env,
    stdio: "inherit",
  });
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`core loop stopped by ${signal}`));
      else resolvePromise(code ?? 1);
    });
  });
}

async function main() {
  loadEnv();
  const strict = process.argv.includes("--strict");
  const run = process.argv.includes("--run-core-loop");
  const manifest = JSON.parse(
    readFileSync(resolve("config/private-infrastructure.json"), "utf8"),
  );

  const results = manifest.capabilities.map((capability) => {
    const missingPaths = capability.paths.filter((path) => !existsSync(resolve(path)));
    const implementationComplete = capability.status !== "partial";
    const configured =
      !capability.anyEnv ||
      capability.anyEnv.length === 0 ||
      capability.anyEnv.some(hasGroup);
    return {
      id: capability.id,
      label: capability.label,
      sourceReady: missingPaths.length === 0,
      implementationComplete,
      configured,
      blocker: capability.blocker ?? null,
      missingPaths,
      acceptedEnvironmentGroups: capability.anyEnv ?? [],
    };
  });

  const missingSource = results.filter((result) => !result.sourceReady);
  const incomplete = results.filter((result) => !result.implementationComplete);
  const unconfigured = results.filter((result) => !result.configured);
  for (const result of results) {
    const state = result.sourceReady && result.implementationComplete && result.configured
      ? "READY"
      : !result.sourceReady
        ? "MISSING_SOURCE"
        : !result.implementationComplete
          ? "INCOMPLETE"
          : "NEEDS_CONFIG";
    console.log(`${state.padEnd(14)} ${result.id.padEnd(22)} ${result.label}`);
  }

  const report = {
    version: manifest.version,
    checkedAt: new Date().toISOString(),
    strict,
    sourceReady: missingSource.length === 0,
    implementationComplete: incomplete.length === 0,
    productionConfigured: unconfigured.length === 0,
    ready: missingSource.length === 0 && incomplete.length === 0 && (!strict || unconfigured.length === 0),
    results,
  };
  console.log(JSON.stringify(report, null, 2));

  if (!report.ready) process.exitCode = 1;
  if (run && report.ready) {
    const code = await runCoreLoop();
    if (code !== 0) process.exitCode = code;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
