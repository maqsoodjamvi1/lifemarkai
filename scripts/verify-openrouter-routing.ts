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
  { in: "gpt-4o", out: "openai/gpt-4o" },
  { in: "gemini-2.0-flash", out: "google/gemini-2.0-flash" },
  { in: "deepseek/deepseek-chat-v3-0324", out: "deepseek/deepseek-chat-v3-0324" },
  { in: "openrouter/gpt-4o-mini", out: "openai/gpt-4o-mini" },
];

for (const c of mappingCases) {
  const got = resolveOpenRouterModelId(c.in);
  check(`resolveOpenRouterModelId: ${c.in}`, got === c.out, { expect: c.out, got });
}

check("DEFAULT_CODING_MODEL maps to Pareto code router", resolveOpenRouterModelId(DEFAULT_CODING_MODEL) === "openrouter/pareto-code", {
  got: resolveOpenRouterModelId(DEFAULT_CODING_MODEL),
});
check("FAST_CODING_MODEL maps to DeepSeek flash", resolveOpenRouterModelId(FAST_CODING_MODEL) === "deepseek/deepseek-v4-flash", {
  got: resolveOpenRouterModelId(FAST_CODING_MODEL),
});
check("BALANCED maps to OpenRouter Fusion", resolveOpenRouterModelId(BALANCED_CODING_MODEL) === "openrouter/fusion", {
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
