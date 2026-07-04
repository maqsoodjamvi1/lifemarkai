import type { EditorMode } from "@/components/editor/editor-layout";
import type { AIModel } from "./provider";
import {
  DEFAULT_CODING_MODEL,
  ECONOMY_CHAT_MODEL,
  ECONOMY_CODING_MODEL,
  FREE_CODING_MODEL,
} from "./model-defaults";
import { shouldAutoSelectClaude } from "./model-catalog";
import { OPENROUTER_MODEL_IDS } from "./openrouter-models";

type CostMode = "economy" | "balanced" | "premium";

const COMPLEX_REQUEST_RE =
  /\b(auth|login|sign[- ]?up|database|supabase|postgres|payment|stripe|checkout|subscription|api|backend|edge function|server|realtime|websocket|oauth|upload|multi[- ]?tenant|permission|analytics|cms|ai connector|chatbot|llm|erp|crm|marketplace|e-?commerce|storefront|admin dashboard)\b/i;

const WHOLE_APP_RE =
  /\b(entire|whole|all pages|every page|all files|codebase|from scratch|rebuild|rewrite|refactor|migrate|redesign|restyle|new website|complete website|complete app|create (a|an)?\s*(website|app|store|erp|crm|dashboard))\b/i;

const FIX_RE = /\b(fix|debug|resolve|repair|error|bug|broken|not working|crash|runtime|module not found)\b/i;

const PREMIUM_MODEL_RE = /opus|sonnet|gpt-5/i;

const APPROVED_MODEL_IDS = new Set<string>(OPENROUTER_MODEL_IDS);
const SAFE_FREE_CODING_MODEL = "qwen/qwen3-coder:free" as AIModel;
const SAFE_ECONOMY_CODING_MODEL = "qwen/qwen3-coder" as AIModel;
const SAFE_ECONOMY_CHAT_MODEL = "deepseek/deepseek-v4-flash" as AIModel;

function currentCostMode(): CostMode {
  const raw = (process.env.AI_COST_MODE || process.env.OPENROUTER_COST_MODE || "economy").toLowerCase();
  if (raw === "premium" || raw === "balanced") return raw;
  return "economy";
}

export function isPremiumModel(model?: string | null): boolean {
  return !!model && PREMIUM_MODEL_RE.test(model);
}

export function isApprovedModel(model?: string | null): boolean {
  return !!model && APPROVED_MODEL_IDS.has(model);
}

function approvedModelOr(model: AIModel | string | null | undefined, fallback: AIModel): AIModel {
  return isApprovedModel(model) ? (model as AIModel) : fallback;
}

function fallbackModelForMode(mode: EditorMode | string): AIModel {
  if (mode === "chat" || mode === "plan" || mode === "patch") {
    return approvedModelOr(ECONOMY_CHAT_MODEL, SAFE_ECONOMY_CHAT_MODEL);
  }
  return approvedModelOr(ECONOMY_CODING_MODEL, SAFE_ECONOMY_CODING_MODEL);
}

export function isSimpleEditorRequest(params: {
  mode: EditorMode | string;
  prompt: string;
  fileCount: number;
  hasImage?: boolean;
}): boolean {
  const prompt = params.prompt.trim();
  if (!prompt || params.hasImage) return false;
  if (params.fileCount <= 0) return false;
  if (prompt.length > 220) return false;
  if (WHOLE_APP_RE.test(prompt)) return false;
  if (COMPLEX_REQUEST_RE.test(prompt) && !FIX_RE.test(prompt)) return false;
  return params.mode === "chat" || params.mode === "patch" || params.mode === "build" || params.mode === "agent";
}

export function resolveBudgetAwareModel(params: {
  requestedModel?: AIModel | null;
  mode: EditorMode | string;
  prompt: string;
  fileCount: number;
  manuallySelected?: boolean;
  hasImage?: boolean;
}): AIModel {
  const requested = params.requestedModel || DEFAULT_CODING_MODEL;
  const costMode = currentCostMode();

  if (!isApprovedModel(requested)) {
    return fallbackModelForMode(params.mode);
  }

  if (params.manuallySelected || costMode === "premium") {
    return requested;
  }

  const justifiedAutoClaude =
    requested.startsWith("anthropic/claude-") &&
    shouldAutoSelectClaude(params.prompt, { mode: params.mode, fileCount: params.fileCount });

  const simple = isSimpleEditorRequest(params);
  if (simple && !justifiedAutoClaude) {
    if (params.mode === "chat" || params.mode === "patch") {
      return approvedModelOr(ECONOMY_CHAT_MODEL, SAFE_ECONOMY_CHAT_MODEL);
    }
    if (FIX_RE.test(params.prompt)) {
      return approvedModelOr(ECONOMY_CODING_MODEL, SAFE_ECONOMY_CODING_MODEL);
    }
    return approvedModelOr(FREE_CODING_MODEL, SAFE_FREE_CODING_MODEL);
  }

  if (costMode === "economy" && isPremiumModel(requested) && !justifiedAutoClaude) {
    return fallbackModelForMode(params.mode);
  }

  return requested;
}

export function maxOutputTokensForRequest(params: {
  mode: EditorMode | string;
  prompt: string;
  fileCount: number;
  defaultBuildMax: number;
  defaultChatMax: number;
  hasImage?: boolean;
}): number {
  if (isSimpleEditorRequest(params)) {
    if (params.mode === "chat") return 1200;
    if (params.mode === "patch") return 2400;
    if (params.mode === "agent") return 4000;
    return FIX_RE.test(params.prompt) ? 4000 : 6000;
  }

  if (params.mode === "plan") return Math.min(params.defaultChatMax, 2000);
  if (params.mode === "chat") return Math.min(params.defaultChatMax, 1800);
  if (params.mode === "patch") return Math.min(params.defaultChatMax, 3500);
  return params.defaultBuildMax;
}

export function contextBudgetForRequest(params: {
  mode: EditorMode | string;
  prompt: string;
  fileCount: number;
  defaultBudget: number;
  hasImage?: boolean;
}): number {
  if (!isSimpleEditorRequest(params)) return params.defaultBudget;
  if (params.mode === "chat") return Math.min(params.defaultBudget, 12000);
  if (params.mode === "patch") return Math.min(params.defaultBudget, 18000);
  return Math.min(params.defaultBudget, 24000);
}
