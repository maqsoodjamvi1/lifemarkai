/**
 * Verifies OpenRouter model ID mapping and AI_VIA_OPENROUTER flag logic.
 */
import {
  resolveOpenRouterModelId,
  shouldRouteAllAiViaOpenRouter,
  DEFAULT_CODING_MODEL,
  FAST_CODING_MODEL,
  BALANCED_CODING_MODEL,
} from "../lib/ai/model-defaults";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, data: Record<string, unknown>) {
  if (ok) passed++;
  else failed++;
  console.log(JSON.stringify({ message: name, ok, ...data }));
}

const mappingCases = [
  { in: "claude-opus-4-8", out: "anthropic/claude-opus-4.8" },
  { in: "claude-opus-4-6", out: "anthropic/claude-opus-4.6" },
  { in: "claude-sonnet-4-6", out: "anthropic/claude-sonnet-4.6" },
  { in: "claude-haiku-4-5-20251001", out: "anthropic/claude-haiku-4.5" },
  { in: "gpt-5.2", out: "openai/gpt-5.2" },
  { in: "gpt-5.2-codex", out: "openai/gpt-5.2-codex" },
  { in: "gemini-3.5-flash", out: "google/gemini-3.5-flash" },
  { in: "deepseek/deepseek-v4-flash", out: "deepseek/deepseek-v4-flash" },
];

for (const c of mappingCases) {
  const got = resolveOpenRouterModelId(c.in);
  check(`resolveOpenRouterModelId: ${c.in}`, got === c.out, { expect: c.out, got });
}

check("DEFAULT_CODING_MODEL maps to Qwen coder", resolveOpenRouterModelId(DEFAULT_CODING_MODEL) === "qwen/qwen3-coder", {
  got: resolveOpenRouterModelId(DEFAULT_CODING_MODEL),
});
check("FAST_CODING_MODEL maps to DeepSeek flash", resolveOpenRouterModelId(FAST_CODING_MODEL) === "deepseek/deepseek-v4-flash", {
  got: resolveOpenRouterModelId(FAST_CODING_MODEL),
});
check("BALANCED maps to DeepSeek pro", resolveOpenRouterModelId(BALANCED_CODING_MODEL) === "deepseek/deepseek-v4-pro", {
  got: resolveOpenRouterModelId(BALANCED_CODING_MODEL),
});

const prevOr = process.env.OPENROUTER_API_KEY;
const prevFlag = process.env.AI_VIA_OPENROUTER;
process.env.OPENROUTER_API_KEY = "test-key";
delete process.env.AI_VIA_OPENROUTER;
check("shouldRouteAllAiViaOpenRouter defaults true when OR key set", shouldRouteAllAiViaOpenRouter() === true, {});
process.env.AI_VIA_OPENROUTER = "false";
check("shouldRouteAllAiViaOpenRouter false when AI_VIA_OPENROUTER=false", shouldRouteAllAiViaOpenRouter() === false, {});
process.env.AI_VIA_OPENROUTER = "true";
check("shouldRouteAllAiViaOpenRouter true when AI_VIA_OPENROUTER=true", shouldRouteAllAiViaOpenRouter() === true, {});

if (prevOr === undefined) delete process.env.OPENROUTER_API_KEY;
else process.env.OPENROUTER_API_KEY = prevOr;
if (prevFlag === undefined) delete process.env.AI_VIA_OPENROUTER;
else process.env.AI_VIA_OPENROUTER = prevFlag;

console.log(JSON.stringify({ message: "summary", passed, failed }));
process.exit(failed > 0 ? 1 : 0);
