import { spawn } from "node:child_process";
import { existsSync,readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
    // The caller may supply all configuration through the shell or CI.
  }
}

loadEnv();

const BASE_URL = (process.env.CORE_LOOP_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const STARTUP_TIMEOUT_MS = Math.max(
  30_000,
  Number.parseInt(process.env.CORE_LOOP_STARTUP_TIMEOUT_MS ?? "180000", 10),
);
const ATTEMPTS = process.env.CORE_LOOP_ATTEMPTS ?? (process.argv.includes("--smoke") ? "1" : "50");

function firstConfigured(...names) {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

function assertCampaignConfiguration() {
  const missing = [];
  if (!firstConfigured("VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")) {
    missing.push("VITE_SUPABASE_URL");
  }
  if (!firstConfigured("VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    missing.push("VITE_SUPABASE_ANON_KEY");
  }
  if (!firstConfigured("CORE_LOOP_EMAIL")) missing.push("CORE_LOOP_EMAIL");
  if (!firstConfigured("CORE_LOOP_PASSWORD")) missing.push("CORE_LOOP_PASSWORD");
  if (Number.parseInt(ATTEMPTS, 10) >= 50 && !firstConfigured("SUPABASE_SERVICE_ROLE_KEY")) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY (required for registration proof on 50+ attempts)");
  }
  if (missing.length > 0) {
    throw new Error(
      "Core-loop configuration is incomplete. Add these values to private .env.local (never commit it):\\n- " +
      missing.join("\\n- ") +
      "\\nSee docs/CORE_LOOP_RELIABILITY.md.",
    );
  }
}

function assertRuntimeDependencies() {
  const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
  if (!existsSync(viteBin)) {
    throw new Error("Dependencies are not installed. Run npm ci, then retry the core-loop command.");
  }
  if (process.platform === "linux" && process.arch === "x64") {
    const binding = fileURLToPath(new URL("../node_modules/@rolldown/binding-linux-x64-gnu/package.json", import.meta.url));
    if (!existsSync(binding)) {
      throw new Error(
        "Rolldown's Linux native binding is missing. Pull the latest branch and run npm ci. " +
        "For an existing Codespace, repair it with npm install --include=optional, then retry.",
      );
    }
  }
  return viteBin;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilReady(child) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError = "server has not responded";

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`LifeMarkAI exited before becoming ready (code ${child.exitCode})`);
    }

    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
      lastError = `${BASE_URL} returned HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(1_000);
  }

  throw new Error(
    `LifeMarkAI did not become ready within ${STARTUP_TIMEOUT_MS}ms: ${lastError}`,
  );
}

function stop(child) {
  if (child.exitCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 10_000);
    timer.unref();

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function main() {
  assertCampaignConfiguration();
  const viteBin = assertRuntimeDependencies();
  const campaign = fileURLToPath(new URL("./verify-core-loop-campaign.ts", import.meta.url));
  const env = { ...process.env, CORE_LOOP_ATTEMPTS: ATTEMPTS };

  console.log(`Starting LifeMarkAI at ${BASE_URL}...`);
  const server = spawn(
    process.execPath,
    [viteBin, "dev", "--port", new URL(BASE_URL).port || "3001"],
    { env, stdio: "inherit" },
  );

  const shutdown = () => {
    void stop(server);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    await waitUntilReady(server);
    console.log(`LifeMarkAI is ready. Running ${ATTEMPTS} core-loop attempt(s)...`);

    const runner = spawn(
      process.execPath,
      ["--import", "tsx", campaign],
      { env, stdio: "inherit" },
    );
    const exitCode = await new Promise((resolve, reject) => {
      runner.once("error", reject);
      runner.once("exit", (code, signal) => {
        if (signal) reject(new Error(`Campaign stopped by ${signal}`));
        else resolve(code ?? 1);
      });
    });

    if (exitCode !== 0) process.exitCode = exitCode;
  } finally {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    await stop(server);
    console.log("LifeMarkAI development server stopped.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
