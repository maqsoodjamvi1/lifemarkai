/**
 * Runtime verification for lib/ai/editor-intelligence.ts
 * Writes NDJSON to debug-799475.log for debug session 799475.
 */
import { appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  resolvePromptMode,
  inferProjectStage,
  getSmartPlaceholder,
  pickActiveFileAfterUpdate,
  shouldFocusPreviewAfterGeneration,
  getEmptyProjectPrompts,
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
    name: "explain → chat",
    prompt: "Explain how React hooks work",
    ctx: baseCtx,
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
    name: "plan keywords → plan",
    prompt: "Plan the architecture for a multi-tenant SaaS",
    ctx: { ...baseCtx, fileCount: 3, files: [{ path: "src/App.tsx" }] },
    expect: "plan" as const,
  },
  {
    hypothesisId: "H1",
    name: "small patch → patch",
    prompt: "Change the header color to blue",
    ctx: {
      ...baseCtx,
      fileCount: 5,
      files: [{ path: "src/App.tsx" }, { path: "src/components/Header.tsx" }],
    },
    expect: "patch" as const,
  },
  {
    hypothesisId: "H1",
    name: "preview error fix → build",
    prompt: "Fix the runtime error in the preview",
    ctx: { ...baseCtx, hasPreviewError: true, fileCount: 4, files: [{ path: "src/App.tsx" }] },
    expect: "build" as const,
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

log({
  location: "verify-editor-intelligence.ts",
  message: "summary",
  data: { passed, failed, total: cases.length },
});

process.exit(failed > 0 ? 1 : 0);
