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
// Optional gitignored file for ephemeral campaign logins (see docs).
loadEnv(".env.core-loop.runtime");

// Vite server reads import.meta.env.VITE_*; many operator envs only set NEXT_PUBLIC_*.
if (!process.env.VITE_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
}
if (!process.env.VITE_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.VITE_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

const BASE_URL = (process.env.CORE_LOOP_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const STARTUP_TIMEOUT_MS = Math.max(
  30_000,
  Number.parseInt(process.env.CORE_LOOP_STARTUP_TIMEOUT_MS ?? "180000", 10),
);
const ATTEMPTS = process.env.CORE_LOOP_ATTEMPTS ?? (process.argv.includes("--smoke") ? "1" : "50");

function configuredValue(...names) {
  return names.map((name) => process.env[name]?.trim()).find(Boolean) ?? "";
}

function isPlaceholder(value) {
  return /(?:your-project|replace-with|example\.com|use-a-dedicated-secret|^\.\.\.$)/i.test(value);
}

async function assertCampaignConfiguration() {
  const urlValue = configuredValue("VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = configuredValue("VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const checks = [
    ["VITE_SUPABASE_URL", urlValue],
    ["VITE_SUPABASE_ANON_KEY", anonKey],
    ["CORE_LOOP_EMAIL", configuredValue("CORE_LOOP_EMAIL")],
    ["CORE_LOOP_PASSWORD", configuredValue("CORE_LOOP_PASSWORD")],
  ];
  if (Number.parseInt(ATTEMPTS, 10) >= 50) checks.push(["SUPABASE_SERVICE_ROLE_KEY", configuredValue("SUPABASE_SERVICE_ROLE_KEY")]);
  const missing = checks.filter(([, value]) => !value).map(([name]) => name);
  const placeholders = checks.filter(([, value]) => value && isPlaceholder(value)).map(([name]) => name);
  if (missing.length > 0 || placeholders.length > 0) {
    const details = [
      ...missing.map((name) => name + " is missing"),
      ...placeholders.map((name) => name + " still contains an example placeholder"),
    ];
    throw new Error("Core-loop configuration is not ready. Update private .env.local:\n- " + details.join("\n- ") + "\nSee docs/CORE_LOOP_RELIABILITY.md.");
  }

  let supabaseUrl;
  try {
    supabaseUrl = new URL(urlValue);
    if (supabaseUrl.protocol !== "https:" && supabaseUrl.hostname !== "localhost") throw new Error("hosted projects must use https");
  } catch (error) {
    throw new Error("VITE_SUPABASE_URL is invalid: " + (error instanceof Error ? error.message : String(error)));
  }

  // /auth/v1/health is intermittently slow or blocked on some networks while
  // token + GoTrue still work. Probe with retries, then fall back to a token
  // request that must return an auth HTTP status (not a TCP failure).
  const authHeaders = { apikey: anonKey, Authorization: "Bearer " + anonKey };
  let lastError = "unknown";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const health = await fetch(new URL("/auth/v1/health", supabaseUrl), {
        headers: authHeaders,
        signal: AbortSignal.timeout(20_000),
      });
      if (health.ok) return;
      lastError = "health HTTP " + health.status;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    try {
      const token = await fetch(new URL("/auth/v1/token?grant_type=password", supabaseUrl), {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "core-loop-preflight@invalid", password: "preflight-check" }),
        signal: AbortSignal.timeout(20_000),
      });
      // Any HTTP response from GoTrue proves Auth is reachable.
      if (token.status > 0) return;
      lastError = "token HTTP " + token.status;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(1_000 * attempt);
  }
  throw new Error(
    "Cannot reach Supabase Auth at " +
      supabaseUrl.origin +
      ": " +
      lastError +
      ". Verify the project URL, that the Supabase project is active, and that this host can reach *.supabase.co.",
  );
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
  await assertCampaignConfiguration();
  const viteBin = assertRuntimeDependencies();
  const campaign = fileURLToPath(new URL("./verify-core-loop-campaign.ts", import.meta.url));
  const coreLoopHost = new URL(BASE_URL).hostname;
  const localCoreLoop =
    coreLoopHost === "localhost" ||
    coreLoopHost === "127.0.0.1" ||
    coreLoopHost === "::1";
  const env = {
    ...process.env,
    CORE_LOOP_ATTEMPTS: ATTEMPTS,
    CORE_LOOP_ACTIVE: "1",
    // Explicit campaign tier so OPENROUTER_CODING_MODEL (legacy qwen in some
    // Codespaces) cannot stall the release gate. Operator override still wins.
    // Keep in sync with CORE_LOOP_CAMPAIGN_PRIMARY_MODEL in core-loop-policy.ts.
    CORE_LOOP_AI_MODEL: process.env.CORE_LOOP_AI_MODEL?.trim() || "openai/gpt-5.6-luna",
    VITE_SUPABASE_URL:
      process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    VITE_SUPABASE_ANON_KEY:
      process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",
    SANDBOX_PROVIDER: "docker",
    SANDBOX_PUBLIC_HOST: process.env.SANDBOX_PUBLIC_HOST || coreLoopHost,
    SANDBOX_PUBLIC_SCHEME: process.env.SANDBOX_PUBLIC_SCHEME || "http",
    // Local Windows/macOS runners often inherit production Coolify docker-proxy
    // env from .env.local (DOCKER_HOST=http://lifemark-docker-proxy:2375 plus a
    // Traefik preview domain). Those names do not resolve here and force proxy
    // mode. Clear them so the gate uses the local Docker engine + published ports.
    ...(localCoreLoop
      ? {
          DOCKER_HOST: "",
          SANDBOX_PREVIEW_DOMAIN: "",
          SANDBOX_PROXY_NETWORK: "",
          SANDBOX_CERT_RESOLVER: "",
          SANDBOX_TRAEFIK_ENTRYPOINT: "",
          SANDBOX_PUBLIC_HOST: process.env.SANDBOX_PUBLIC_HOST || "localhost",
          SANDBOX_PUBLIC_SCHEME: "http",
          // node:http cannot use /var/run/docker.sock on Windows; the Desktop
          // named pipe is the local Engine API endpoint.
          ...(process.platform === "win32"
            ? { DOCKER_SOCKET: process.env.DOCKER_SOCKET || "\\\\.\\pipe\\docker_engine" }
            : {}),
        }
      : {}),
  };

  console.log(`Starting LifeMarkAI at ${BASE_URL}...`);
  console.log(`Core-loop preview backend: Docker (${env.SANDBOX_PUBLIC_HOST})`);
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
