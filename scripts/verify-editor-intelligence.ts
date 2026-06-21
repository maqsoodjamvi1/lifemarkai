/**
 * Runtime verification for lib/ai/editor-intelligence.ts
 * Writes NDJSON to debug-799475.log for debug session 799475.
 */
import { appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  resolvePromptMode,
  resolveSmartModel,
  inferProjectStage,
  getSmartPlaceholder,
  pickActiveFileAfterUpdate,
  shouldFocusPreviewAfterGeneration,
  getEmptyProjectPrompts,
  MODEL_TIERS,
} from "../lib/ai/editor-intelligence";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = join(__dirname, "..", "debug-799475.log");
const SESSION = "799475";

function log(payload: Record<string, unknown>) {
  const line = JSON.stringify({ sessionId: SESSION, timestamp: Date.now(), runId: "verify", ...payload });
  appendFileSync(LOG_PATH, `${line}\n`);
  console.log(line);
}

const baseCtx = {
  fileCount: 0,
  hasPreviewError: false,
  framework: "react",
  currentMode: "build" as const,
  files: [] as { path: string }[],
};

const cases = [
  {
    hypothesisId: "H1",
    name: "explain on build tab → build",
    prompt: "Explain how React hooks work",
    ctx: baseCtx,
    expect: "build" as const,
  },
  {
    hypothesisId: "H1",
    name: "explain on chat tab → chat",
    prompt: "Explain how React hooks work",
    ctx: { ...baseCtx, currentMode: "chat" as const },
    expect: "chat" as const,
  },
  {
    hypothesisId: "H1",
    name: "build app → build",
    prompt: "Build a todo app with dark mode",
    ctx: baseCtx,
    expect: "build" as const,
  },
  {
    hypothesisId: "H1",
    name: "plan keywords on build tab → build",
    prompt: "Plan the architecture for a multi-tenant SaaS",
    ctx: { ...baseCtx, fileCount: 3, files: [{ path: "src/App.tsx" }] },
    expect: "build" as const,
  },
  {
    hypothesisId: "H1",
    name: "small patch on build tab → build",
    prompt: "Change the header color to blue",
    ctx: {
      ...baseCtx,
      fileCount: 5,
      files: [{ path: "src/App.tsx" }, { path: "src/components/Header.tsx" }],
    },
    expect: "build" as const,
  },
  {
    hypothesisId: "H1",
    name: "small patch on patch tab → patch",
    prompt: "Change the header color to blue",
    ctx: {
      ...baseCtx,
      currentMode: "patch" as const,
      fileCount: 5,
      files: [{ path: "src/App.tsx" }, { path: "src/components/Header.tsx" }],
    },
    expect: "patch" as const,
  },
  {
    hypothesisId: "H1",
    name: "create login page on build tab → build",
    prompt: "Create a login page with email and password",
    ctx: {
      ...baseCtx,
      fileCount: 12,
      files: [{ path: "src/App.tsx" }, { path: "src/pages/Home.tsx" }],
    },
    expect: "build" as const,
  },
  {
    hypothesisId: "H1",
    name: "preview error fix → build",
    prompt: "Fix the runtime error in the preview",
    ctx: { ...baseCtx, hasPreviewError: true, fileCount: 4, files: [{ path: "src/App.tsx" }] },
    expect: "build" as const,
  },
  {
    hypothesisId: "H4",
    name: "investigate while build toggle → chat",
    prompt: "Please investigate why the login form validation fails",
    ctx: { ...baseCtx, fileCount: 8, files: [{ path: "src/App.tsx" }, { path: "src/Login.tsx" }] },
    expect: "chat" as const,
  },
  {
    hypothesisId: "H4",
    name: "what-if while build toggle → chat",
    prompt: "What would happen if we switched from localStorage to cookies?",
    ctx: { ...baseCtx, fileCount: 5, files: [{ path: "src/App.tsx" }] },
    expect: "chat" as const,
  },
];

let passed = 0;
let failed = 0;

for (const c of cases) {
  const got = resolvePromptMode(c.prompt, c.ctx);
  const ok = got === c.expect;
  if (ok) passed++;
  else failed++;
  log({
    hypothesisId: c.hypothesisId,
    location: "verify-editor-intelligence.ts",
    message: `resolvePromptMode: ${c.name}`,
    data: { prompt: c.prompt, expect: c.expect, got, ok },
  });
}

const stageEmpty = inferProjectStage([]);
const stageApp = inferProjectStage([
  { path: "src/App.tsx" },
  { path: "src/pages/Home.tsx" },
  { path: "src/components/Header.tsx" },
  { path: "src/components/Footer.tsx" },
  { path: "src/lib/utils.ts" },
  { path: "src/main.tsx" },
]);
log({
  hypothesisId: "H2",
  location: "verify-editor-intelligence.ts",
  message: "inferProjectStage",
  data: { stageEmpty, stageApp, ok: stageEmpty === "empty" && stageApp === "app" },
});

const placeholder = getSmartPlaceholder({
  ...baseCtx,
  streaming: false,
  isLocked: false,
});
log({
  hypothesisId: "H2",
  location: "verify-editor-intelligence.ts",
  message: "getSmartPlaceholder empty build",
  data: { placeholder, hasAppHint: placeholder.toLowerCase().includes("app") },
});

const files = [
  { id: "1", path: "src/components/Button.tsx", content: "", project_id: "p", language: "tsx", created_at: "", updated_at: "" },
  { id: "2", path: "src/App.tsx", content: "", project_id: "p", language: "tsx", created_at: "", updated_at: "" },
];
const pickedEntry = pickActiveFileAfterUpdate(
  files,
  ["src/components/Button.tsx", "src/App.tsx"],
  files[0],
);
log({
  hypothesisId: "H3",
  location: "verify-editor-intelligence.ts",
  message: "pickActiveFileAfterUpdate prefers entrypoint among updates",
  data: { picked: pickedEntry?.path, ok: pickedEntry?.path === "src/App.tsx" },
});

const focusBuild = shouldFocusPreviewAfterGeneration("build", 2);
const focusChat = shouldFocusPreviewAfterGeneration("chat", 2);
log({
  hypothesisId: "H3",
  location: "verify-editor-intelligence.ts",
  message: "shouldFocusPreviewAfterGeneration",
  data: { focusBuild, focusChat, ok: focusBuild === true && focusChat === false },
});

const emptyPrompts = getEmptyProjectPrompts("empty", "react");
log({
  hypothesisId: "H2",
  location: "verify-editor-intelligence.ts",
  message: "getEmptyProjectPrompts",
  data: { count: emptyPrompts.length, first: emptyPrompts[0], ok: emptyPrompts.length >= 3 },
});

const modelCases = [
  // Multi-provider per-task orchestration (Lovable parity)
  { name: "build → opus (coding)", mode: "build" as const, prompt: "Build a todo app", expect: MODEL_TIERS.coding },
  { name: "agent → opus (coding)", mode: "agent" as const, prompt: "Add auth", expect: MODEL_TIERS.coding },
  { name: "short patch → gemini flash", mode: "patch" as const, prompt: "Make header blue", expect: MODEL_TIERS.chat },
  { name: "short chat → gemini flash", mode: "chat" as const, prompt: "What is React?", expect: MODEL_TIERS.chat },
  { name: "plan → gpt-5.2 (reasoning)", mode: "plan" as const, prompt: "Plan a SaaS dashboard", expect: MODEL_TIERS.reasoning },
];
for (const mc of modelCases) {
  const got = resolveSmartModel(mc.mode, { fileCount: 5, hasPreviewError: false }, mc.prompt);
  const ok = got === mc.expect;
  if (ok) passed++;
  else failed++;
  log({
    hypothesisId: "H5",
    location: "verify-editor-intelligence.ts",
    message: `resolveSmartModel: ${mc.name}`,
    data: { mode: mc.mode, expect: mc.expect, got, ok },
  });
}

log({
  location: "verify-editor-intelligence.ts",
  message: "summary",
  data: { passed, failed, total: cases.length },
});

process.exit(failed > 0 ? 1 : 0);
