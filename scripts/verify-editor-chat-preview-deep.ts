/**
 * Deep integration audit: editor intelligence + chat stream + preview wiring.
 * Run: npx tsx scripts/verify-editor-chat-preview-deep.ts
 * Optional live: NEXT_PUBLIC_APP_URL=http://localhost:3000 (needs dev server + .env.local)
 */
import { readFileSync } from "fs";
import {
  resolvePromptMode,
  shouldFocusPreviewAfterGeneration,
} from "../lib/ai/editor-intelligence";
import { buildHealingPrompt, formatErrorsForHealing } from "../lib/preview/preview-error-bridge";
import { resolvePreviewEngine } from "../lib/preview/resolve-preview-engine";
import { PREVIEW_ENGINE_REV } from "../lib/preview/build-fallback-html";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

type Check = { name: string; ok: boolean; detail?: unknown };

const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  checks.push({ name, ok, detail });
  console.log(JSON.stringify({ ok, name, detail }));
}

// ── Intelligence routing ────────────────────────────────────────────────────

const emptyCtx = { fileCount: 0, hasPreviewError: false, hasCredits: true, currentMode: "chat" as const };
const appCtx = {
  fileCount: 12,
  hasPreviewError: false,
  hasCredits: true,
  currentMode: "build" as const,
  files: [
    { path: "src/App.tsx", content: "export default function App(){}" },
    { path: "src/main.tsx", content: "import App from './App'" },
    { path: "src/pages/Home.tsx", content: "" },
    { path: "src/pages/About.tsx", content: "" },
    { path: "src/components/Header.tsx", content: "" },
    { path: "src/components/Footer.tsx", content: "" },
    { path: "package.json", content: '{"devDependencies":{"vite":"5"}}' },
    { path: "vite.config.ts", content: "" },
  ],
};

check(
  "chat tab: plain build prompt stays chat",
  resolvePromptMode("Build a coffee shop", emptyCtx) === "chat",
);
check(
  "chat tab: /build escapes to build",
  resolvePromptMode("/build add hero", emptyCtx) === "build",
);
check(
  "build tab on app: add feature → agent",
  resolvePromptMode("Add dark mode toggle", appCtx) === "agent",
);
check(
  "preview error + fix keyword → patch/build",
  ["patch", "build"].includes(
    resolvePromptMode("fix the preview error", { ...appCtx, hasPreviewError: true }),
  ),
);

// ── Source-level invariants (grep audit) ────────────────────────────────────

const chatSrc = readFileSync("components/editor/chat-panel.tsx", "utf8");
const fixSrc = readFileSync("app/api/ai/fix/route.ts", "utf8");
const agentSrc = readFileSync("app/api/ai/agent/route.ts", "utf8");
const streamHookSrc = readFileSync("hooks/use-ai-stream-chat.ts", "utf8");
const previewSrc = readFileSync("components/editor/preview-panel.tsx", "utf8");

check(
  "chat: consumeAIStream uses effectiveMode for applyFileUpdates",
  /applyFileUpdates:\s*\n?\s*effectiveMode === "build"/.test(chatSrc),
);
check(
  "chat: auto-fix uses functional onMessagesUpdate",
  chatSrc.includes("onMessagesUpdate((prev) =>"),
);
check(
  "chat: agent done dispatches preview refresh",
  chatSrc.includes('lifemark-refresh-preview') && chatSrc.includes("onFilesUpdate(updatedFiles)"),
);
check(
  "fix route: live environment lock",
  fixSrc.includes('environment === "live"') && fixSrc.includes("423"),
);
check(
  "stream hook: per-request applyFileUpdates override",
  streamHookSrc.includes("opts?.applyFileUpdates"),
);
check(
  "chat: heal coordination events",
  chatSrc.includes("lifemark-preview-heal-start") && chatSrc.includes("healActiveRef"),
);
check(
  "agent min credits constant",
  agentSrc.includes("AGENT_MIN_CREDITS") && chatSrc.includes("AGENT_MIN_CREDITS"),
);
check(
  "preview: faster debounce while generating",
  previewSrc.includes("isGenerating ? 120 : 500"),
);
check(
  "preview engine rev present",
  Number.parseInt(PREVIEW_ENGINE_REV, 10) >= 17,
  { rev: PREVIEW_ENGINE_REV },
);

// ── Preview engine matrix ───────────────────────────────────────────────────

check(
  "vite project → webcontainer when isolated",
  resolvePreviewEngine(
    [{ path: "package.json", content: '{"devDependencies":{"vite":"5"}}' }, { path: "vite.config.ts", content: "" }],
    { preferWebContainers: true, crossOriginIsolated: true },
  ) === "webcontainer",
);
check(
  "vite project → fallback when not isolated",
  resolvePreviewEngine(
    [{ path: "package.json", content: '{"devDependencies":{"vite":"5"}}' }],
    { preferWebContainers: true, crossOriginIsolated: false },
  ) === "fallback",
);

// ── Error healing prompt ──────────────────────────────────────────────────────

const healing = buildHealingPrompt([
  { kind: "bundler", message: "SyntaxError: unexpected token", timestamp: Date.now() },
]);
check("healing prompt includes error log", healing.includes("SyntaxError") && healing.includes("file_update"));
check(
  "formatErrorsForHealing is non-empty",
  formatErrorsForHealing([{ kind: "runtime", message: "boom", timestamp: 1 }]).length > 0,
);

check(
  "shouldFocusPreviewAfterGeneration(build)",
  shouldFocusPreviewAfterGeneration("build", 3) === true,
);

// ── Optional live smoke ───────────────────────────────────────────────────────

async function main() {
  try {
    const health = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) {
      check("live: dev server reachable", false, { status: health.status });
    } else {
      check("live: dev server reachable", true, { url: BASE });

      let env: Record<string, string> = {};
      try {
        env = Object.fromEntries(
          readFileSync(".env.local", "utf8")
            .split("\n")
            .filter((l) => l && !l.startsWith("#") && l.includes("="))
            .map((l) => {
              const i = l.indexOf("=");
              return [l.slice(0, i), l.slice(i + 1)];
            }),
        );
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        const { data: auth, error } = await sb.auth.signInWithPassword({
          email: env.DEMO_EMAIL ?? "demo@lifemark.ai",
          password: env.DEMO_PASSWORD ?? "demo123456",
        });
        if (error || !auth.session) {
          check("live: demo auth", false, error?.message);
        } else {
          const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
          const cookie = `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify({
            access_token: auth.session.access_token,
            refresh_token: auth.session.refresh_token,
            expires_at: auth.session.expires_at,
            expires_in: auth.session.expires_in,
            token_type: "bearer",
            user: auth.session.user,
          }))}`;
          const { data: projects } = await sb.from("projects").select("id").limit(1);
          const projectId = projects?.[0]?.id;
          if (!projectId) {
            check("live: project exists", false);
          } else {
            const chatRes = await fetch(`${BASE}/api/ai/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Cookie: cookie },
              body: JSON.stringify({
                projectId,
                message: "What files are in this project? One sentence only.",
                mode: "chat",
                files: [],
                history: [],
              }),
            });
            check("live: chat SSE 200", chatRes.ok, { status: chatRes.status });
          }
        }
      } catch (e) {
        check("live: auth smoke", false, String(e));
      }
    }
  } catch (e) {
    check("live: dev server reachable", false, String(e));
  }

  const failed = checks.filter((c) => !c.ok).length;
  const passed = checks.length - failed;
  console.log(JSON.stringify({ summary: { passed, failed, total: checks.length, ok: failed === 0 } }));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
