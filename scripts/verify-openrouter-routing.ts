/**
 * Verifies OpenRouter model ID mapping and AI_VIA_OPENROUTER flag logic.
 */
import {
  resolveOpenRouterModelId,
  useOpenRouterForAll,
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
  { in: "claude-opus-4-6", out: "anthropic/claude-opus-4-6" },
  { in: "claude-sonnet-4-6", out: "anthropic/claude-sonnet-4-6" },
  { in: "gpt-4o", out: "openai/gpt-4o" },
  { in: "gemini-2.0-flash", out: "google/gemini-2.0-flash" },
  { in: "deepseek/deepseek-chat-v3-0324", out: "deepseek/deepseek-chat-v3-0324" },
  { in: "openrouter/gpt-4o-mini", out: "openai/gpt-4o-mini" },
];

for (const c of mappingCases) {
  const got = resolveOpenRouterModelId(c.in);
  check(`resolveOpenRouterModelId: ${c.in}`, got === c.out, { expect: c.out, got });
}

check("DEFAULT_CODING_MODEL maps to anthropic/sonnet", resolveOpenRouterModelId(DEFAULT_CODING_MODEL) === "anthropic/claude-sonnet-4-6", {
  got: resolveOpenRouterModelId(DEFAULT_CODING_MODEL),
});
check("FAST_CODING_MODEL maps to openai mini", resolveOpenRouterModelId(FAST_CODING_MODEL) === "openai/gpt-4o-mini", {
  got: resolveOpenRouterModelId(FAST_CODING_MODEL),
});
check("BALANCED maps to anthropic/sonnet", resolveOpenRouterModelId(BALANCED_CODING_MODEL) === "anthropic/claude-sonnet-4-6", {
  got: resolveOpenRouterModelId(BALANCED_CODING_MODEL),
});

const prevOr = process.env.OPENROUTER_API_KEY;
const prevFlag = process.env.AI_VIA_OPENROUTER;
process.env.OPENROUTER_API_KEY = "test-key";
delete process.env.AI_VIA_OPENROUTER;
check("useOpenRouterForAll defaults true when OR key set", useOpenRouterForAll() === true, {});
process.env.AI_VIA_OPENROUTER = "false";
check("useOpenRouterForAll false when AI_VIA_OPENROUTER=false", useOpenRouterForAll() === false, {});
process.env.AI_VIA_OPENROUTER = "true";
check("useOpenRouterForAll true when AI_VIA_OPENROUTER=true", useOpenRouterForAll() === true, {});

if (prevOr === undefined) delete process.env.OPENROUTER_API_KEY;
else process.env.OPENROUTER_API_KEY = prevOr;
if (prevFlag === undefined) delete process.env.AI_VIA_OPENROUTER;
else process.env.AI_VIA_OPENROUTER = prevFlag;

console.log(JSON.stringify({ message: "summary", passed, failed }));
process.exit(failed > 0 ? 1 : 0);
