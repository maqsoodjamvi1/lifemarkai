import type { EditorMode } from "@/components/editor/editor-layout";
import type { ProjectFile } from "@/types/database";
import { classifyBuildIntent, shouldAutoBuildMode } from "./build-intent";
import type { AIModel } from "./provider";
import {
  BALANCED_CODING_MODEL,
  DEFAULT_CODING_MODEL,
  FAST_CODING_MODEL,
} from "./model-defaults";

export { DEFAULT_CODING_MODEL, BALANCED_CODING_MODEL, FAST_CODING_MODEL };

export const CLAUDE_MODELS = {
  opus: DEFAULT_CODING_MODEL,
  sonnet: BALANCED_CODING_MODEL,
  haiku: FAST_CODING_MODEL,
} as const;

export type ProjectStage = "empty" | "scaffold" | "app";

export interface EditorIntelContext {
  fileCount: number;
  hasPreviewError: boolean;
  /** When false, suppress preview-error prompts and fix placeholders */
  hasCredits?: boolean;
  activeFilePath?: string | null;
  framework?: string | null;
  currentMode: EditorMode;
  /** Used for build-intent classification in AI context blocks */
  lastPrompt?: string;
  files?: Pick<ProjectFile, "path">[];
}

const PLAN_KEYWORDS =
  /\b(plan|architect|design|investigate|analyze|analyse|strategy|roadmap|how should|why does|why is|explain why|before we build|think through|break down)\b/i;

const PATCH_KEYWORDS =
  /\b(change|update|rename|tweak|adjust|fix typo|make the|set the|turn the|swap|replace the text|change color|change font|increase|decrease|move the|align)\b/i;

const FIX_KEYWORDS = /\b(fix|debug|resolve|repair|broken|error|bug|crash|not working|doesn't work)\b/i;

const CHAT_KEYWORDS =
  /\b(explain|what does|what is|how does|how do|describe|tell me about|summarize|walk me through)\b/i;

/** Investigation / hypotheticals — stay conversational, never auto-build (Lovable parity). */
const INVESTIGATE_KEYWORDS =
  /\b(please investigate|what would happen if|what happens if|what if we|could you investigate|help me investigate|look into why|figure out why|find out why|diagnose why|root cause)\b/i;

const ENTRYPOINTS = [
  "app/page.tsx",
  "src/App.tsx",
  "src/main.tsx",
  "src/pages/Home.tsx",
  "index.html",
];

/** Rough project maturity from file list. */
export function inferProjectStage(files: Pick<ProjectFile, "path">[]): ProjectStage {
  if (files.length === 0) return "empty";
  const paths = files.map((f) => f.path);
  const hasEntry = paths.some((p) => ENTRYPOINTS.includes(p));
  const hasMultiplePages =
    paths.filter((p) => /pages\/|components\/|src\//.test(p)).length >= 3;
  if (hasEntry && (hasMultiplePages || files.length >= 6)) return "app";
  return "scaffold";
}

/**
 * Pick the best Claude model for a prompt given editor mode and project context.
 * Opus is the default for coding; Haiku/Sonnet handle lighter conversational work.
 */
export function resolveSmartModel(
  mode: EditorMode,
  ctx: Pick<EditorIntelContext, "fileCount" | "hasPreviewError">,
  prompt?: string,
): AIModel {
  const trimmed = prompt?.trim() ?? "";

  if (ctx.hasPreviewError && /\b(fix|debug|resolve|repair|error|bug)\b/i.test(trimmed)) {
    return CLAUDE_MODELS.opus;
  }

  if (mode === "agent" || mode === "build") {
    return CLAUDE_MODELS.opus;
  }

  if (mode === "plan") {
    return trimmed.length > 200 ? CLAUDE_MODELS.opus : CLAUDE_MODELS.sonnet;
  }

  if (mode === "patch") {
    return trimmed.length < 100 ? CLAUDE_MODELS.haiku : CLAUDE_MODELS.sonnet;
  }

  // chat / default
  if (trimmed.length < 80) return CLAUDE_MODELS.haiku;
  if (trimmed.length < 200) return CLAUDE_MODELS.sonnet;
  return CLAUDE_MODELS.opus;
}

/** Pick the best editor mode for a user prompt given project context. */
export function resolvePromptMode(
  prompt: string,
  ctx: EditorIntelContext,
  overrideMode?: EditorMode,
): EditorMode {
  if (overrideMode) return overrideMode;

  const trimmed = prompt.trim();
  if (!trimmed) return ctx.currentMode;

  // Explicit mode overrides from slash commands or UI
  if (/^\/plan\b/i.test(trimmed)) return "plan";
  if (/^\/build\b/i.test(trimmed)) return "build";
  if (/^\/agent\b/i.test(trimmed)) return "agent";

  // Honor explicitly selected Agent tab — don't downgrade to build/chat via keywords
  if (ctx.currentMode === "agent") return "agent";

  // Investigation prompts → chat even when Build toggle is active
  if (INVESTIGATE_KEYWORDS.test(trimmed) && !shouldAutoBuildMode(trimmed)) {
    return "chat";
  }
  if (/\binvestigate\b/i.test(trimmed) && !shouldAutoBuildMode(trimmed) && !/\bplan\b/i.test(trimmed)) {
    return "chat";
  }

  // Honor Build / Quick Edit tabs — user expects code changes, not chat replies
  if (ctx.currentMode === "build" || ctx.currentMode === "patch") {
    return ctx.currentMode;
  }

  if (CHAT_KEYWORDS.test(trimmed) && !shouldAutoBuildMode(trimmed)) {
    return "chat";
  }

  if (ctx.hasPreviewError && FIX_KEYWORDS.test(trimmed)) {
    return trimmed.length < 120 && PATCH_KEYWORDS.test(trimmed) ? "patch" : "build";
  }

  if (PLAN_KEYWORDS.test(trimmed) && !shouldAutoBuildMode(trimmed)) {
    return "plan";
  }

  if (
    PATCH_KEYWORDS.test(trimmed) &&
    trimmed.length < 180 &&
    ctx.fileCount > 0 &&
    !shouldAutoBuildMode(trimmed)
  ) {
    return "patch";
  }

  if (shouldAutoBuildMode(trimmed)) {
    return "build";
  }

  if (ctx.fileCount === 0 && /\b(create|build|make|generate|scaffold|start)\b/i.test(trimmed)) {
    return "build";
  }

  return ctx.currentMode;
}

function stageFromCtx(ctx: EditorIntelContext): ProjectStage {
  if (ctx.files?.length) return inferProjectStage(ctx.files);
  if (ctx.fileCount === 0) return "empty";
  if (ctx.fileCount >= 6) return "app";
  return "scaffold";
}

/** Context-aware input placeholder. */
export function getSmartPlaceholder(
  ctx: EditorIntelContext & { streaming: boolean; isLocked: boolean },
): string {
  if (ctx.isLocked) return "Switch to Test mode to make AI edits…";
  if (ctx.streaming) return "queue follow-up…";
  if (ctx.hasCredits === false) {
    return "Out of credits — upgrade your plan to keep building with AI…";
  }

  const stage = stageFromCtx(ctx);

  if (ctx.hasPreviewError) {
    return "Describe the fix, or ask me to debug the preview error…";
  }

  switch (ctx.currentMode) {
    case "plan":
      return stage === "empty"
        ? "Describe what you want to build — I'll draft a plan first…"
        : "Ask for an architecture plan or refactor strategy…";
    case "build":
      return stage === "empty"
        ? "Describe your app — e.g. 'Build a cargo logistics website'…"
        : "Describe what to build or change — I'll update the files…";
    case "agent":
      return "Give a goal — I'll explore the codebase and implement it…";
    case "patch":
      return "Describe a small change — e.g. 'Make the header sticky'…";
    default:
      if (stage === "empty") {
        return "Describe your app idea, or switch to Build mode to generate files…";
      }
      if (ctx.activeFilePath) {
        return `Ask about @${ctx.activeFilePath}, or describe what to change…`;
      }
      return "Ask me anything about your project…";
  }
}

/** Starter prompts when the project has no messages yet. */
export function getEmptyProjectPrompts(stage: ProjectStage, framework?: string | null): string[] {
  const fw = framework ?? "react";
  if (stage === "empty") {
    return [
      "Build a modern SaaS landing page with pricing",
      "Create an admin dashboard with sidebar navigation",
      "Build a Shopify storefront with product grid and cart",
      "Build a point-of-sale app for a coffee shop",
    ];
  }
  if (stage === "scaffold") {
    return [
      "Flesh out the main page with realistic content",
      "Add a responsive navigation header and footer",
      `Improve the ${fw} app styling with Tailwind`,
    ];
  }
  return [
    "Add dark mode support",
    "Make the layout mobile responsive",
    "Polish spacing, typography, and empty states",
  ];
}

/** Quick actions when the user is out of credits. */
export function getNoCreditsPrompts(): string[] {
  return [
    "Upgrade plan to continue building",
    "Review my project files without making changes",
    "What can I do while waiting for credits to reset?",
  ];
}

/** Quick actions when preview has a runtime error. */
export function getPreviewErrorPrompts(error: string): string[] {
  const short = error.slice(0, 80).toLowerCase();
  const prompts = ["Fix the preview error without breaking other features"];
  if (short.includes("module") || short.includes("import")) {
    prompts.push("Fix the missing import or module path");
  }
  if (short.includes("syntax")) {
    prompts.push("Fix the syntax error in the generated code");
  }
  prompts.push("Switch to Plan mode and investigate root cause");
  return prompts.slice(0, 3);
}

/** After AI writes files, pick the most relevant tab to open. */
export function pickActiveFileAfterUpdate(
  files: ProjectFile[],
  updatedPaths: string[],
  current: ProjectFile | null,
): ProjectFile | null {
  if (updatedPaths.length === 0) return current;

  const priority = (path: string) => {
    if (ENTRYPOINTS.includes(path)) return 0;
    if (/pages\/|app\/page|App\.tsx/i.test(path)) return 1;
    if (/components\//i.test(path)) return 2;
    if (/\.tsx?$/.test(path)) return 3;
    return 4;
  };

  const sorted = [...updatedPaths].sort((a, b) => priority(a) - priority(b));
  for (const path of sorted) {
    const match = files.find((f) => f.path === path);
    if (match) return match;
  }
  return files.find((f) => f.path === sorted[0]) ?? current;
}

/** Whether to snap to preview after a generation pass. */
export function shouldFocusPreviewAfterGeneration(
  mode: EditorMode,
  filesGenerated: number,
): boolean {
  return filesGenerated > 0 && (mode === "build" || mode === "patch" || mode === "agent");
}

/** Compact project summary injected into AI messages. */
export function buildProjectContextBlock(ctx: EditorIntelContext): string {
  const stage = stageFromCtx(ctx);
  const intent = ctx.lastPrompt ? classifyBuildIntent(ctx.lastPrompt) : null;

  return [
    "<project_context>",
    `Stage: ${stage} (${ctx.fileCount} files)`,
    ctx.framework ? `Framework: ${ctx.framework}` : "",
    ctx.activeFilePath ? `Active file: ${ctx.activeFilePath}` : "",
    ctx.hasPreviewError ? "Preview status: runtime error present — prioritize fixes" : "Preview status: ok",
    intent ? `Inferred app type: ${intent.appType}` : "",
    "</project_context>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Enrich follow-up chips using project stage + generated paths. */
export function enrichFollowUpSuggestions(
  base: string[],
  stage: ProjectStage,
  generatedFiles: string[],
): string[] {
  const extra: string[] = [];
  if (stage === "empty" || stage === "scaffold") {
    extra.push("Add realistic mock data", "Create the remaining core pages");
  }
  if (generatedFiles.some((p) => p.includes("layout") || p.includes("Header"))) {
    extra.push("Make navigation mobile-friendly");
  }
  const merged = [...new Set([...base, ...extra])];
  return merged.slice(0, 3);
}
