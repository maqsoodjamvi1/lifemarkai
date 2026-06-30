/**
 * Production readiness — runs all Lovable parity checks + env/migration gates.
 * Writes NDJSON to debug-799475.log (session 799475).
 */
import { appendFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG = join(ROOT, "debug-799475.log");
const SESSION = "799475";

function log(payload: Record<string, unknown>) {
  const line = JSON.stringify({ sessionId: SESSION, timestamp: Date.now(), runId: "production", ...payload });
  appendFileSync(LOG, `${line}\n`);
  console.log(line);
}

let passed = 0;
let failed = 0;
let warned = 0;

function assert(id: string, name: string, ok: boolean, data?: Record<string, unknown>) {
  if (ok) passed++;
  else failed++;
  log({ hypothesisId: id, location: "verify-production-ready.ts", message: name, data: { ok, ...data } });
}

function warn(id: string, name: string, detail: string) {
  warned++;
  log({ hypothesisId: id, location: "verify-production-ready.ts", message: name, data: { ok: true, warn: true, detail } });
}

function runScript(script: string, id: string) {
  try {
    execSync(`npx tsx ${script}`, { cwd: ROOT, stdio: "pipe", encoding: "utf8" });
    assert(id, `${script} exit 0`, true);
    return true;
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    assert(id, `${script} exit 0`, false, {
      status: err.status,
      stderr: (err.stderr ?? "").slice(0, 200),
    });
    return false;
  }
}

// ── Parity suites ─────────────────────────────────────────────────────────────
runScript("scripts/verify-lovable-gaps.ts", "P1");
runScript("scripts/verify-tier2-gaps.ts", "P2");
runScript("scripts/verify-tier3-gaps.ts", "P3");
runScript("scripts/verify-tier5-gaps.ts", "P3b");
runScript("scripts/verify-tier6-gaps.ts", "P3c");
runScript("scripts/verify-tier7-gaps.ts", "P3d");
runScript("scripts/verify-tier8-gaps.ts", "P3e");
runScript("scripts/verify-editor-intelligence.ts", "P4");
runScript("scripts/verify-openrouter-routing.ts", "P4b");
runScript("scripts/verify-openrouter-catalog.ts", "P4c");

// ── Product moat checks ─────────────────────────────────────────────────────
const aiProxyPath = join(ROOT, "app/api/projects/[id]/ai-proxy/route.ts");
const aiProxy = existsSync(aiProxyPath) ? readFileSync(aiProxyPath, "utf8") : "";
assert("P4d", "built-app AI proxy is multimodal", ["chat", "image", "embedding", "stt", "tts"].every((cap) => aiProxy.includes(`"${cap}"`)), {
  hint: "Keep /api/projects/:id/ai-proxy as the no-key generated-app AI connector",
});
assert("P4d", "built-app AI proxy uses gateway-aware generateAI", aiProxy.includes("@/lib/ai/generate"));

const chatPanelPath = join(ROOT, "components/editor/chat-panel.tsx");
const chatPanel = existsSync(chatPanelPath) ? readFileSync(chatPanelPath, "utf8") : "";
assert("P4e", "Auto model route is visible in chat panel", chatPanel.includes("activeModelLabel") && chatPanel.includes("Auto"));

const aiPanelPath = join(ROOT, "components/editor/ai-integration-panel.tsx");
const aiPanel = existsSync(aiPanelPath) ? readFileSync(aiPanelPath, "utf8") : "";
assert("P4f", "AI Integration panel exposes connector capabilities", ["Built-App AI Connector", "Embeddings", "STT", "TTS"].every((text) => aiPanel.includes(text)));

const securityCenterPath = join(ROOT, "components/dashboard/security-center-page.tsx");
const securityCenter = existsSync(securityCenterPath) ? readFileSync(securityCenterPath, "utf8") : "";
assert("P4g", "Security Center calls project static/PII scan", securityCenter.includes("/security-scan") && securityCenter.includes("scanResults"));

const securityScanPath = join(ROOT, "app/api/projects/[id]/security-scan/route.ts");
const securityScan = existsSync(securityScanPath) ? readFileSync(securityScanPath, "utf8") : "";
assert("P4g", "Project security scan includes PII scanner", securityScan.includes("scanProject") && readFileSync(join(ROOT, "lib/security/scan.ts"), "utf8").includes("pii-credit-card"));

// ── Required migrations for parity features ─────────────────────────────────
const REQUIRED_MIGRATIONS = [
  "058_element_comments.sql",
  "061_cloud_tool_permissions.sql",
  "062_nested_project_groups.sql",
  "072_ai_integration_openrouter_default.sql",
];
for (const m of REQUIRED_MIGRATIONS) {
  assert("P5", `migration ${m}`, existsSync(join(ROOT, "supabase/migrations", m)));
}

// ── Env vars (warn if missing — optional keys don't fail) ─────────────────────
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
];
const AI_ENV_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY"];
const OPTIONAL_ENV = [
  "SEMRUSH_API_KEY",
  "NETLIFY_AUTH_TOKEN",
  "LIFEMARK_GATEWAY_URL",
  "STRIPE_SECRET_KEY",
];

const envPath = join(ROOT, ".env.local");
let envKeys = new Set<string>();
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) envKeys.add(t.slice(0, i));
  }
  for (const key of REQUIRED_ENV) {
    if (!envKeys.has(key)) {
      assert("P6", `env ${key}`, false, { hint: "Set in .env.local" });
    } else {
      assert("P6", `env ${key}`, true);
    }
  }
  const hasAiKey = envKeys.has("OPENROUTER_API_KEY") || AI_ENV_KEYS.some((k) => envKeys.has(k));
  const orPreferred = envKeys.has("AI_VIA_OPENROUTER")
    ? !["false", "0"].includes((process.env.AI_VIA_OPENROUTER ?? "").toLowerCase())
    : envKeys.has("OPENROUTER_API_KEY");
  if (orPreferred && !envKeys.has("OPENROUTER_API_KEY")) {
    assert("P6", "env OPENROUTER_API_KEY (AI_VIA_OPENROUTER)", false, {
      hint: "Set OPENROUTER_API_KEY — all AI tools route through OpenRouter",
    });
  } else {
    assert("P6", "env AI provider (any)", hasAiKey, {
      hint: hasAiKey ? undefined : "Set OPENROUTER_API_KEY (recommended) or a direct provider key",
    });
  }
  for (const key of OPTIONAL_ENV) {
    if (!envKeys.has(key)) {
      warn("P6", `optional env ${key}`, "Not set — related features disabled");
    }
  }
} else {
  warn("P6", ".env.local", "File not found — skipping env checks (CI may inject env differently)");
}

// ── Build artifacts sanity ────────────────────────────────────────────────────
assert("P7", "docs route", existsSync(join(ROOT, "app/(marketing)/docs/page.tsx")));
assert("P7", "MCP route", existsSync(join(ROOT, "app/api/mcp/route.ts")));
assert("P7", "native panel", existsSync(join(ROOT, "components/editor/native-distribution-panel.tsx")));
assert("P8", "production build (.next/BUILD_ID)", existsSync(join(ROOT, ".next", "BUILD_ID")), {
  hint: "Run npm run build before deploy",
});

log({
  location: "verify-production-ready.ts",
  message: "summary",
  data: { passed, failed, warned, ready: failed === 0 },
});

process.exit(failed > 0 ? 1 : 0);
