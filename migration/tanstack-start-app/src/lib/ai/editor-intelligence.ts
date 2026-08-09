import type { EditorMode } from "@/components/editor/editor-layout";
import type { ProjectFile } from "../../types/database.ts";
import { classifyBuildIntent, isInformationalQuery, isMajorGreenfieldBuild, shouldAutoBuildMode } from "./build-intent.ts";
import type { AIModel } from "./provider.ts";
import {
BALANCED_CODING_MODEL,
DEFAULT_CODING_MODEL,
DEFAULT_CHAT_MODEL,
FAST_CODING_MODEL,
REASONING_MODEL,
DESIGN_MODEL,
CONTENT_MODEL,
IMAGE_MODEL,
REVIEW_MODEL,
ESCALATION_MODEL,
FREE_CODING_MODEL,
ECONOMY_CODING_MODEL,
ECONOMY_CHAT_MODEL,
} from "./model-defaults.ts";
import { selectModelChain,type ModelStrength } from "./model-catalog.ts";

export { DEFAULT_CODING_MODEL, BALANCED_CODING_MODEL, FAST_CODING_MODEL, DEFAULT_CHAT_MODEL, REASONING_MODEL };

export const DEFAULT_MODEL_ALIASES = {
  opus: DEFAULT_CODING_MODEL,
  sonnet: BALANCED_CODING_MODEL,
  haiku: FAST_CODING_MODEL,
} as const;

/** @deprecated Use DEFAULT_MODEL_ALIASES. Kept for older imports. */
export const CLAUDE_MODELS = DEFAULT_MODEL_ALIASES;

/**
 * Per-task model tiers for Lovable-style orchestration. Text models resolve to
 * OpenRouter slugs in model-defaults.ts and route through the single
 * OPENROUTER_API_KEY by default; override any tier via env
 * (OPENROUTER_CODING_MODEL, OPENROUTER_DESIGN_MODEL, OPENROUTER_CONTENT_MODEL, ...).
 * Defaults: code -> Qwen, balanced/reasoning/chat -> DeepSeek, fast ->
 * DeepSeek V4 Flash, image -> the native image model. The prompt-aware catalog
 * can auto-promote to Claude when a request needs deeper reasoning/debugging.
 */
export const MODEL_TIERS = {
  /** Code generation, agent runs, error fixing — best coder. */
  coding: DEFAULT_CODING_MODEL,
  /** UI / layout / styling / polish — best at Tailwind + design. */
  design: DESIGN_MODEL,
  /** Copywriting, marketing content, SEO text — strong writer. */
  content: CONTENT_MODEL,
  /** Architecture / planning — strong general reasoning. */
  reasoning: REASONING_MODEL,
  /** Conversational Q&A — fast + cheap. */
  chat: DEFAULT_CHAT_MODEL,
  /** Medium-complexity work. */
  balanced: BALANCED_CODING_MODEL,
  /** Trivial/lightweight tasks — fastest + cheapest. */
  fast: FAST_CODING_MODEL,
  /** Cross-vendor reviewer (CTO reviews, debate adjudication) — deliberately a
   *  different model family than `coding` so reviews aren't an echo chamber. */
  review: REVIEW_MODEL,
  /** Strongest model, used ONLY on retry after a task failed its normal tier. */
  escalation: ESCALATION_MODEL,
  /** Image generation — handled by /api/ai/image, not the text providers. */
  image: IMAGE_MODEL,
} as const;

export type TaskType = "code" | "design" | "content" | "image" | "reasoning" | "chat";

const DESIGN_KEYWORDS =
  /\b(design|styl(e|ing)|theme|colou?r|palette|layout|spacing|typograph|font|ui|ux|responsive|animation|hero section|landing page look|polish|beautif|modern look|redesign|visual|gradient|dark mode|make it look)\b/i;

const CONTENT_KEYWORDS =
  /\b(copy|copywriting|content|headlines?|taglines?|slogans?|descriptions?|blog post|articles?|about (us|page)|marketing copy|product descriptions?|write (the|some|a|product|copy|content|text)|rewrite the (text|copy)|seo|microcopy|cta text|placeholder text)\b/i;

const IMAGE_KEYWORDS =
  /\b(image|images|photo|picture|hero image|banner image|background image|logo|icon|illustration|product photo|avatar|generate (an? )?(image|photo|logo|icon)|add (an? )?(image|photo|logo|icon|picture))\b/i;

const IMAGE_ACTION = /\b(add|create|generate|make|need|want|insert|put|replace|design)\b/i;

/** True when the prompt is asking to add/generate an image (route to /api/ai/image). */
export function detectImageIntent(prompt: string): boolean {
  const p = prompt ?? "";
  return IMAGE_KEYWORDS.test(p) && IMAGE_ACTION.test(p);
}

/** Classify the dominant task type of a prompt for best-model routing. */
/** Deep-thinking signals PLAN_KEYWORDS misses: `\barchitect\b` doesn't match
 *  "architecture", and comparison/decision questions carried no keyword at
 *  all — so "compare architecture tradeoffs" was routed to the CHEAP chat
 *  tier (verified July 2). Kept separate from PLAN_KEYWORDS because that
 *  regex also drives mode resolution; this one only affects model choice. */
const REASONING_HINTS =
  /\b(architectur\w*|trade-?offs?|pros and cons|scalab\w*|should we (use|choose|pick|go with)|which (approach|option|database|stack|framework)|compare|versus|\bvs\.?\b)\b/i;

export function detectTaskType(prompt: string): TaskType {
  const p = prompt ?? "";
  if (detectImageIntent(p)) return "image";
  if (PLAN_KEYWORDS.test(p)) return "reasoning";
  if (REASONING_HINTS.test(p)) return "reasoning";
  // Explicit WRITING requests win over design even when they mention a UI
  // area ("write marketing copy for the hero section" is copywriting, not
  // layout — verified July 2: it routed to the design tier because
  // "hero section" tripped DESIGN_KEYWORDS first).
  if (/\b(write|rewrite|draft|compose)\b/i.test(p) && CONTENT_KEYWORDS.test(p)) return "content";
  // Design vs content can co-occur with code; prefer design when both styling and
  // copy are mentioned, since layout quality dominates perceived quality.
  if (DESIGN_KEYWORDS.test(p)) return "design";
  if (CONTENT_KEYWORDS.test(p)) return "content";
  if (CHAT_KEYWORDS.test(p)) return "chat";
  return "code";
}

/** Resolve the best model for an explicit task type. */
export function getModelForTask(task: TaskType): AIModel {
  switch (task) {
    case "design": return MODEL_TIERS.design as AIModel;
    case "content": return MODEL_TIERS.content as AIModel;
    case "reasoning": return MODEL_TIERS.reasoning;
    case "chat": return MODEL_TIERS.chat;
    case "image": return MODEL_TIERS.image as AIModel;
    case "code":
    default: return MODEL_TIERS.coding;
  }
}

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

const GREETING_PROMPT =
  /^(?:hi|hello|hey|hiya|greetings|good morning|good afternoon|good evening|yo|what's up|sup|howdy)\b/i;

const GENERIC_BUILD_REQUEST =
  /\b(?:build|create|make|design|generate|develop|start|launch|set up|setup)\b[\s\S]{0,80}?\b(?:app|website|site|landing page|store|shop|platform|portal)\b/i;

const SPECIFIC_BUILD_DETAILS =
  /\b(checkout|cart|dashboard|login|signup|booking|appointment|menu|blog|portfolio|crm|erp|payment|subscription|membership|orders?|product|inventory|profile|database|api|backend|admin|course|lesson|ticket|reservation|service|pricing|testimonials|gallery|contact form|features|about|pricing|team|faq|support)\b/i;

function isGreetingPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;
  if (trimmed.length > 80) return false;
  if (!GREETING_PROMPT.test(trimmed)) return false;
  if (isInformationalQuery(trimmed)) return false;
  if (shouldAutoBuildMode(trimmed)) return false;
  return true;
}

function isVagueGreenfieldProjectPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed || trimmed.length > 100) return false;
  if (!GENERIC_BUILD_REQUEST.test(trimmed)) return false;
  if (SPECIFIC_BUILD_DETAILS.test(trimmed)) return false;
  return true;
}

const CASUAL_SOCIAL =
  /^(?:thanks?|thank you|ok(?:ay)?|cool|nice|great|perfect|awesome|got it|sounds good|yep|nope|yes|no|hm+|hmm+)\b/i;

/** Greetings, thanks, and other non-build chit-chat — never auto-run a full build. */
function isCasualConversation(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;
  if (isGreetingPrompt(trimmed)) return true;
  if (isInformationalQuery(trimmed)) return true;
  if (shouldAutoBuildMode(trimmed) || isCodeChangeIntent(trimmed)) return false;
  if (trimmed.length <= 48 && CASUAL_SOCIAL.test(trimmed)) return true;
  return false;
}

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
 * Pick the best model for a prompt given editor mode and project context.
 * OpenRouter-first per-task selection (Lovable-style orchestration):
 *   coding/fixing -> approved code models, with diverse fallback families
 *   planning      -> approved reasoning models
 *   quick patches -> fast, cheap specialist models
 *   chat          -> approved reasoning/chat models, with cheap fallback when appropriate
 * The provider layer still supports direct-provider fallback when OpenRouter is
 * disabled — see lib/ai/provider.ts.
 */
export function resolveSmartModel(
  mode: EditorMode,
  ctx: Pick<EditorIntelContext, "fileCount" | "hasPreviewError">,
  prompt?: string,
): AIModel {
  return resolveModelChain(mode, ctx, prompt)[0];
}

/**
 * Prompt-aware model cascade for the hybrid solve. Returns an ordered list of
 * models — chain[0] is the best fit; later entries are strong, family-diverse
 * fallbacks used for cross-model verification when an attempt fails (see
 * lib/ai/self-verify.ts). Seeds capability hints + a guaranteed-valid anchor
 * (the proven per-mode tier) from the editor mode, then lets the curated
 * catalog (lib/ai/model-catalog.ts) pick across the approved OpenRouter set.
 */
/** Features that make a build too complex for a free-tier coder. */
const COMPLEX_FEATURE_RE =
  /\b(auth|login|sign[- ]?up|database|supabase|postgres|payment|stripe|paddle|checkout|cart|subscription|api|backend|edge function|server|realtime|websocket|admin|dashboard|integration|webhook|oauth|upload|multi[- ]?tenant|role|permission|analytics|cms|ai|chatbot|llm)\b/i;

/** App types that are content/presentation-first (no app logic to get wrong). */
const CONTENT_APP_TYPES = new Set<string>(["marketing-website"]);

/**
 * True when a build/agent request is safe to route to the FREE coding model:
 *  - a NEW simple content-only website (landing/marketing/portfolio-style,
 *    no complex features), or
 *  - a tiny lightweight edit to an existing app (short prompt, no complex
 *    features, not an error fix).
 * Quality safety nets still apply: provider.ts falls back to a paid model on
 * free-pool congestion, self-verify catches broken output, and the richness
 * gate triggers a (paid) enrichment pass if the result is thin.
 */
export function isFreeEligibleBuild(prompt: string, fileCount: number): boolean {
  const trimmed = prompt.trim();
  if (!trimmed || COMPLEX_FEATURE_RE.test(trimmed)) return false;
  // Tiny incremental edit on an existing app ("make the header sticky").
  if (fileCount > 0 && trimmed.length < 90) return true;
  // New content-first site: classify only for new/near-empty projects.
  if (fileCount <= 8) {
    try {
      const { appType } = classifyBuildIntent(trimmed);
      return CONTENT_APP_TYPES.has(appType);
    } catch {
      return false;
    }
  }
  return false;
}

function isSmallExistingEdit(prompt: string, fileCount: number): boolean {
  const trimmed = prompt.trim();
  if (fileCount <= 0 || !trimmed || trimmed.length > 220) return false;
  if (COMPLEX_FEATURE_RE.test(trimmed) && !FIX_KEYWORDS.test(trimmed)) return false;
  if (/\b(entire|whole|all pages|every page|all files|codebase|from scratch|rebuild|rewrite|refactor|migrate|redesign|restyle)\b/i.test(trimmed)) {
    return false;
  }
  return true;
}

function shouldUseAgentForEdit(prompt: string, ctx: Pick<EditorIntelContext, "fileCount" | "hasPreviewError">): boolean {
  const trimmed = prompt.trim();
  if (!trimmed || ctx.fileCount <= 0) return false;
  if (/\b(use|run|switch to|agent mode|autonomous|multi[- ]?agent)\b/i.test(trimmed)) return true;
  if (trimmed.length >= 420) return true;
  const coordinators = trimmed.match(/\b(and|then|also|plus|after that|next)\b/gi)?.length ?? 0;
  if (coordinators >= 3) return true;
  if (
    /\b(entire|whole|all pages|every page|all files|codebase|from scratch|rebuild|rewrite|refactor|migrate|architecture|database|auth|login|signup|supabase|stripe|payment|backend|api|webhook|oauth|security|permissions?|roles?|integration|performance|slow query|production|complete app|full app)\b/i.test(trimmed)
  ) {
    return true;
  }
  return ctx.hasPreviewError && trimmed.length > 260 && FIX_KEYWORDS.test(trimmed);
}

export function resolveModelChain(
  mode: EditorMode,
  ctx: Pick<EditorIntelContext, "fileCount" | "hasPreviewError">,
  prompt?: string,
): AIModel[] {
  const trimmed = prompt?.trim() ?? "";
  const require: ModelStrength[] = [];
  let preferCheap = false;
  let anchor: AIModel = MODEL_TIERS.coding;

  const smallExistingEdit = isSmallExistingEdit(trimmed, ctx.fileCount);

  if (ctx.hasPreviewError && /\b(fix|debug|resolve|repair|error|bug)\b/i.test(trimmed)) {
    require.push("fixes", "code");
    preferCheap = smallExistingEdit;
    anchor = smallExistingEdit ? ECONOMY_CODING_MODEL : MODEL_TIERS.coding;
  } else if (mode === "agent" || mode === "build") {
    require.push("code");
    const majorGreenfield = isMajorGreenfieldBuild(trimmed, ctx.fileCount);
    // Cost-aware routing: simple content sites + tiny edits go FREE first
    // (paid fallback on congestion; error fixes above never come here).
    // Major greenfield apps (ERP, e-commerce, full sites) always start on the
    // primary coding tier — free/economy models routinely ship 3-file scaffolds.
    anchor = majorGreenfield
      ? MODEL_TIERS.coding
      : isFreeEligibleBuild(trimmed, ctx.fileCount)
        ? FREE_CODING_MODEL
        : smallExistingEdit
          ? ECONOMY_CODING_MODEL
          : MODEL_TIERS.coding;
    preferCheap =
      !majorGreenfield && (isFreeEligibleBuild(trimmed, ctx.fileCount) || smallExistingEdit);
  } else if (mode === "plan") {
    require.push("reasoning");
    anchor = trimmed.length > 200 ? MODEL_TIERS.coding : MODEL_TIERS.reasoning;
  } else if (mode === "patch") {
    // Patch must emit precise find/replace JSON against real source — use a
    // coding model. Chat/flash models often return prose and leave fileCount=0
    // (e.g. "add menu items in header" → empty patch).
    require.push("code");
    preferCheap = trimmed.length < 120 || smallExistingEdit;
    anchor = preferCheap ? ECONOMY_CODING_MODEL : MODEL_TIERS.coding;
  } else {
    // chat / default — route by task type first, then length-based escalation.
    const task = detectTaskType(trimmed);
    if (task === "design") {
      require.push("design");
      anchor = MODEL_TIERS.design as AIModel;
    } else if (task === "content") {
      require.push("content");
      anchor = MODEL_TIERS.content as AIModel;
    } else if (task === "reasoning") {
      require.push("reasoning");
      const lightweightReasoning =
        trimmed.length < 220 &&
        !/\b(architectur\w*|trade-?offs?|compare|versus|\bvs\.?\b|root cause|security|production|critical|entire|whole|codebase|refactor|migration|database|auth|payment)\b/i.test(trimmed);
      preferCheap = lightweightReasoning;
      anchor = lightweightReasoning ? ECONOMY_CHAT_MODEL : MODEL_TIERS.reasoning;
    } else {
      preferCheap = trimmed.length < 160 || smallExistingEdit;
      anchor =
        trimmed.length < 160
          ? ECONOMY_CHAT_MODEL
          : trimmed.length < 300
            ? MODEL_TIERS.balanced
            : MODEL_TIERS.coding;
    }
  }

  // HONOR THE ANCHOR. selectModelChain ranks its own curated catalog for
  // fallback diversity but does NOT place the anchor first (verified July 2:
  // every tier choice — Kimi design, Opus reasoning, Sonnet coding, free-tier
  // routing — was silently discarded, error fixes even landed on :free
  // models, and env-configured models outside the catalog could never be
  // selected). chain[0] must be the tier the branches above chose; the
  // catalog ranking supplies the retry/escalation tail.
  const fallback = selectModelChain(trimmed, { require, preferCheap, anchor });
  return [anchor, ...fallback.filter((m) => m !== anchor)];
}

function isCodeChangeIntent(prompt: string): boolean {
  if (CHAT_KEYWORDS.test(prompt) || PLAN_KEYWORDS.test(prompt) || INVESTIGATE_KEYWORDS.test(prompt)) {
    return false;
  }
  return /\b(add|create|implement|integrate|update|change|fix|remove|delete|build|make|refactor|wire|connect|rename|replace|move|hide|show|enable|disable|set|swap|tweak|adjust)\b/i.test(
    prompt,
  );
}

/**
 * Chat-tab escape hatch: edits that should write files without requiring /build.
 * Lovable default: if the project already has files and the user asks to change
 * the UI/code, promote out of Chat so the preview actually updates.
 * Excludes greenfield "build/create a … app/site" (those stay Chat unless /build).
 */
function isSurgicalEditFromChat(prompt: string): boolean {
  if (/\b(rebuild|from scratch|entire|whole app)\b/i.test(prompt)) return false;
  if (/\b(build|create|make|generate|scaffold)\b.+\b(app|website|site|landing|dashboard|store|saas|platform)\b/i.test(prompt)) {
    return false;
  }
  if (PATCH_KEYWORDS.test(prompt)) return true;
  // Imperative UI chrome — "add About to the header", "put Contact in the nav"
  if (
    /\b(add|insert|include|put|place|append)\b.+\b(menu|nav|navbar|item|link|button|section|header|footer|tab|page|card|modal|form|field|logo|hero|title|heading|text|label|color|theme|style)\b/i.test(
      prompt,
    )
  ) {
    return true;
  }
  // "make the header blue", "remove Premium from the hero"
  if (
    /\b(make|turn|set|remove|delete|hide|show|rename|replace|swap|update|change|fix|tweak|adjust)\b.+\b(header|footer|nav|navbar|menu|hero|button|title|heading|text|color|theme|style|font|logo|card|section|page|link)\b/i.test(
      prompt,
    )
  ) {
    return true;
  }
  return isCodeChangeIntent(prompt) && !/\b(build|create|make|generate|scaffold)\b/i.test(prompt);
}

/** True when the prompt looks like an edit but Chat mode would only answer in prose. */
export function looksLikeEditRequest(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;
  if (CHAT_KEYWORDS.test(trimmed) || PLAN_KEYWORDS.test(trimmed) || INVESTIGATE_KEYWORDS.test(trimmed)) {
    return false;
  }
  return isSurgicalEditFromChat(trimmed) || isCodeChangeIntent(trimmed);
}

/** Small chrome edits that should use patch even from the Build tab. */
function isQuickUiChromeEdit(prompt: string): boolean {
  if (PATCH_KEYWORDS.test(prompt)) return true;
  return /\b(add|insert|include|put|update|change|fix|remove|make|set|rename|replace)\b.+\b(menu|nav|navbar|item|link|button|header|footer|tab|hero|title|color|theme|logo)\b/i.test(
    prompt,
  );
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

  if (isCasualConversation(trimmed)) {
    return "chat";
  }

  if (ctx.fileCount === 0 && isVagueGreenfieldProjectPrompt(trimmed)) {
    return "chat";
  }

  // Honor explicitly selected Agent tab — don't downgrade to build/chat via keywords
  if (ctx.currentMode === "agent") return "agent";

  // Chat tab: Q&A by default. Explicit slash commands escape to other modes.
  // Surgical edit intents auto-promote so "add a menu item" actually writes
  // files — Chat mode itself never persists project_files. Vague greenfield
  // "build a website" stays in Chat (parity); specific product asks promote.
  if (ctx.currentMode === "chat") {
    if (/^\/build\b/i.test(trimmed)) return "build";
    if (/^\/agent\b/i.test(trimmed)) return "agent";
    if (/^\/plan\b/i.test(trimmed)) return "plan";
    if (
      shouldAutoBuildMode(trimmed) &&
      !isVagueGreenfieldProjectPrompt(trimmed)
    ) {
      return stageFromCtx(ctx) === "app" ? "agent" : "build";
    }
    if (ctx.fileCount > 0 && isSurgicalEditFromChat(trimmed)) {
      return shouldUseAgentForEdit(trimmed, ctx) ? "agent" : "patch";
    }
    return "chat";
  }

  // Investigation prompts → chat even when Build toggle is active
  if (INVESTIGATE_KEYWORDS.test(trimmed) && !shouldAutoBuildMode(trimmed)) {
    return "chat";
  }
  if (/\binvestigate\b/i.test(trimmed) && !shouldAutoBuildMode(trimmed) && !/\bplan\b/i.test(trimmed)) {
    return "chat";
  }

  // Preview/runtime errors → surgical fix modes (before generic agent routing on build tab).
  if (ctx.hasPreviewError && FIX_KEYWORDS.test(trimmed)) {
    return trimmed.length < 120 && PATCH_KEYWORDS.test(trimmed) ? "patch" : "build";
  }

  // Honor Build tab — short UI chrome edits use patch (fast, writes files);
  // larger code changes on existing apps go through agent (Lovable default).
  if (ctx.currentMode === "build") {
    if (isInformationalQuery(trimmed) && !shouldAutoBuildMode(trimmed)) {
      return "chat";
    }
    if (CHAT_KEYWORDS.test(trimmed) && !shouldAutoBuildMode(trimmed)) {
      return "chat";
    }
    if (
      (PLAN_KEYWORDS.test(trimmed) || REASONING_HINTS.test(trimmed)) &&
      !/\b(implement|build|create|add|fix|update|change|wire|connect|integrate|migrate|remove|delete)\b/i.test(trimmed)
    ) {
      return "plan";
    }
    if (PLAN_KEYWORDS.test(trimmed) && !shouldAutoBuildMode(trimmed)) {
      return "plan";
    }
    if (
      ctx.fileCount > 0 &&
      isCodeChangeIntent(trimmed) &&
      (isQuickUiChromeEdit(trimmed) || isSmallExistingEdit(trimmed, ctx.fileCount))
    ) {
      return "patch";
    }
    if (ctx.fileCount > 0 && isCodeChangeIntent(trimmed)) {
      return shouldUseAgentForEdit(trimmed, ctx) ? "agent" : "patch";
    }
    if (isCasualConversation(trimmed)) {
      return "chat";
    }
    if (
      ctx.fileCount === 0 &&
      !shouldAutoBuildMode(trimmed) &&
      !isCodeChangeIntent(trimmed) &&
      !/^\/build\b/i.test(trimmed)
    ) {
      return "chat";
    }
    return "build";
  }
  if (ctx.currentMode === "patch") {
    return "patch";
  }

  if (CHAT_KEYWORDS.test(trimmed) && !shouldAutoBuildMode(trimmed)) {
    return "chat";
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
    // Lovable parity: Agent is default for edits on existing apps (Aug 2025+).
    if (stageFromCtx(ctx) === "app") {
      return "agent";
    }
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
  if (short.includes("map") || short.includes("undefined")) {
    prompts.push("Guard .map() calls — use (items ?? []).map() and default context state to []");
  }
  if (short.includes("missing component") || short.includes("failed to resolve")) {
    prompts.push("Fix import/export mismatch — create missing files or align default vs named exports");
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
