/**
 * Objective model benchmark.
 *
 *   node scripts/eval-models.mjs                      # default: coding suite
 *   node scripts/eval-models.mjs --suite=design
 *   node scripts/eval-models.mjs --models=a,b --runs=3
 *
 * Why this exists: `ai_eval_log.success` only means the HTTP call returned. It
 * says nothing about whether the generated code was usable, so every model
 * looks like "100% success" and tier choices end up being made on vibes. This
 * harness scores MACHINE-CHECKABLE outcomes instead:
 *
 *   - does the emitted code actually PARSE as TSX (esbuild, not a regex)
 *   - did the requested edit land, and did the model leave the rest alone
 *   - is a JSON contract response strictly parseable with the right keys
 *
 * It also reports real latency and real cost from OpenRouter's own usage
 * numbers, so "fast and cheap" is measured rather than assumed.
 *
 * Requires OPENROUTER_API_KEY. Costs a few cents per full run.
 */
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const KEY = process.env.OPENROUTER_API_KEY;
const DIRECT = Boolean(process.argv[1] && process.argv[1].endsWith("eval-models.mjs"));
if (DIRECT && !KEY) {
  console.error("OPENROUTER_API_KEY is required (this harness makes real calls).");
  process.exit(1);
}

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

// USD per 1M tokens — keep in step with gateway/src/index.ts TOKEN_COST_MAP.
const PRICES = {
  "qwen/qwen3-coder": [0.3, 1.0],
  "deepseek/deepseek-v4-flash": [0.083, 0.165],
  "deepseek/deepseek-v4-pro": [1.32, 3.96],
  "anthropic/claude-sonnet-5": [2.0, 10.0],
  "anthropic/claude-haiku-4.5": [1.0, 5.0],
  "google/gemini-3.1-flash-lite": [0.25, 1.5],
  "google/gemini-3.6-flash": [0.75, 3.75],
  "moonshotai/kimi-k2.7-code": [0.71, 3.5],
  "mistralai/codestral-2508": [0.3, 0.9],
  "z-ai/glm-5.2": [0.966, 3.036],
  "openai/gpt-5.6-terra": [2.0, 12.0],
  "z-ai/glm-5-turbo": [1.2, 4.0],
  "nvidia/nemotron-3-super-120b-a12b:free": [0, 0],
  "cohere/north-mini-code:free": [0, 0],
  // Budget shortlist — the cheapest models on OpenRouter with >=200k context.
  "qwen/qwen3.7-flash": [0.03, 0.13],
  "qwen/qwen3-coder-30b-a3b-instruct": [0.07, 0.28],
  "inclusionai/ling-3.0-flash": [0.021, 0.063],
  "upstage/solar-pro4": [0.03, 0.12],
  "z-ai/glm-4.7-flash": [0.06, 0.4],
  "nvidia/nemotron-3-super-120b-a12b": [0.085, 0.4],
  "mistralai/mistral-small-3.2-24b-instruct": [0.094, 0.25],
  "xiaomi/mimo-v2.5": [0.14, 0.28],
  "stepfun/step-3.5-flash": [0.1, 0.3],
  "bytedance-seed/seed-2.0-mini": [0.1, 0.4],
  // Full-catalog search, 2026-08-19.
  "qwen/qwen3-coder-next": [0.12, 0.8],
  "qwen/qwen3-coder-flash": [0.195, 0.975],
  "qwen/qwen3-coder-plus": [0.65, 3.25],
  "kwaipilot/kat-coder-pro-v2": [0.3, 1.2],
  "kwaipilot/kat-coder-air-v2.5": [0.15, 0.6],
  "kwaipilot/kat-coder-pro-v2.5": [0.74, 2.96],
  "anthropic/claude-opus-5": [5, 25],
  "sakana/fugu-ultra": [5, 30],
  "nvidia/nemotron-3-ultra-550b-a55b:free": [0, 0],
  "nvidia/nemotron-3.5-lightning:free": [0, 0],
  "dots-studio/dots-3-note-preview:free": [0, 0],
  "poolside/laguna-s-2.1:free": [0, 0],
  "google/gemma-4-31b-it:free": [0, 0],
  "nvidia/nemotron-3-nano-30b-a3b:free": [0, 0],
  "z-ai/glm-5.2:free": [0, 0],
};

const SUITES = {
  // No OpenAI anywhere: the product removed those models, so benchmarking them
  // would only produce numbers for something that can no longer be routed.
  coding: [
    "xiaomi/mimo-v2.5",
    "mistralai/mistral-small-3.2-24b-instruct",
    "upstage/solar-pro4",
    "qwen/qwen3-coder",
    "deepseek/deepseek-v4-flash",
    "mistralai/codestral-2508",
    "z-ai/glm-5.2",
    "moonshotai/kimi-k2.7-code",
  ],
  design: [
    "mistralai/mistral-small-3.2-24b-instruct",
    "moonshotai/kimi-k2.7-code",
    "google/gemini-3.6-flash",
    "anthropic/claude-sonnet-5",
    "deepseek/deepseek-v4-pro",
  ],
  fast: [
    "google/gemini-3.1-flash-lite",
    "mistralai/codestral-2508",
    "deepseek/deepseek-v4-flash",
    "upstage/solar-pro4",
  ],
  free: ["nvidia/nemotron-3-super-120b-a12b:free", "cohere/north-mini-code:free"],
  // The "cheapest credible model" search. Every entry is under $0.06 per
  // 5-call build at list price, has >=200k context and a live endpoint.
  // ── Role searches over the full 415-model catalog (2026-08-19) ───────────
  // best-in-coding: every model on OpenRouter whose name signals code
  // specialisation, plus the strongest generalists that beat coders in practice.
  bestcoding: [
    "qwen/qwen3-coder-next",
    "qwen/qwen3-coder-flash",
    "qwen/qwen3-coder-plus",
    "kwaipilot/kat-coder-pro-v2",
    "kwaipilot/kat-coder-air-v2.5",
    "xiaomi/mimo-v2.5",
    "moonshotai/kimi-k2.7-code",
    "deepseek/deepseek-v4-pro",
  ],
  // frontier: the escalation target. Strongest available, price is secondary,
  // but no OpenAI — those are excluded from this product.
  frontier: [
    "anthropic/claude-opus-5",
    "anthropic/claude-sonnet-5",
    "deepseek/deepseek-v4-pro",
    "z-ai/glm-5.2",
    "sakana/fugu-ultra",
  ],
  // freefast: all 19 zero-cost models, minus the audio/safety/tiny ones.
  freefast: [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "dots-studio/dots-3-note-preview:free",
    "poolside/laguna-s-2.1:free",
    "google/gemma-4-31b-it:free",
    "cohere/north-mini-code:free",
    "z-ai/glm-5.2:free",
  ],
  // The four-tier ladder specified by the operator, 2026-08-19.
  ladder: [
    "deepseek/deepseek-v4-flash",
    "z-ai/glm-5.2",
    "deepseek/deepseek-v4-pro",
    "openai/gpt-5.6-terra",
  ],
  budget: [
    "qwen/qwen3.7-flash",
    "qwen/qwen3-coder-30b-a3b-instruct",
    "inclusionai/ling-3.0-flash",
    "upstage/solar-pro4",
    "z-ai/glm-4.7-flash",
    "nvidia/nemotron-3-super-120b-a12b",
    "mistralai/mistral-small-3.2-24b-instruct",
    "xiaomi/mimo-v2.5",
  ],
};

// ── Extract the code the model meant to emit ─────────────────────────────────
export function extractCode(text) {
  const fences = [...String(text ?? "").matchAll(/```(?:tsx|jsx|typescript|ts|js)?\s*\n([\s\S]*?)```/g)];
  if (fences.length) return fences.map((m) => m[1]).join("\n");
  return String(text ?? "");
}

/**
 * Compile the generated code with the PROJECT'S OWN tsc, via the CLI.
 *
 * Deliberately not the TypeScript compiler API: `typescript@7` (the Go rewrite)
 * exports only `version`, so `ts.createProgram` is undefined there and an
 * API-based checker silently throws on any repo that has upgraded. The CLI is
 * stable across both major versions and is the same compiler your build runs.
 *
 * Returns { syntax: string[], types: string[] } — TS1xxx are parse failures,
 * everything else is a type failure. Module-resolution noise (no react types in
 * a temp dir) is filtered out: that's a sandbox artefact, not a model mistake.
 */
// Verified against fixtures in scripts/eval-models.test.mjs before being trusted.
// 7026/2875/2874 are "no JSX.IntrinsicElements" — the React type package isn't
// in the temp dir. Without this, EVERY model that emits JSX scores as a strict
// type failure, which is how a benchmark ends up confidently ranking noise.
const IGNORED_TS_CODES = new Set([
  2307, 2304, 2318, 2688, 2503, 7016, 6053, 2792, 7026, 2875, 2874,
]);

async function tscDiagnostics(code, { strict }) {
  const dir = await mkdtemp(join(tmpdir(), "evalmodels-"));
  const file = join(dir, "gen.tsx");
  try {
    await writeFile(file, code, "utf8");
    const args = [
      "tsc", "--noEmit", "--skipLibCheck", "--jsx", "react-jsx",
      "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler",
      strict ? "--strict" : "--strict false", file,
    ].flatMap((a) => (a === "--strict false" ? ["--strict", "false"] : [a]));
    await run("npx", args, { timeout: 60000 });
    return { syntax: [], types: [] };
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    const diags = [...out.matchAll(/error TS(\d+): ([^\n]+)/g)]
      .map(([, codeStr, msg]) => ({ code: Number(codeStr), msg: msg.trim() }))
      .filter((d) => !IGNORED_TS_CODES.has(d.code));
    return {
      syntax: diags.filter((d) => d.code < 2000).map((d) => `TS${d.code}: ${d.msg.slice(0, 70)}`),
      types: diags.filter((d) => d.code >= 2000).map((d) => `TS${d.code}: ${d.msg.slice(0, 70)}`),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Does it PARSE as TSX? Returns null on success. */
export async function tsxParseError(code) {
  const { syntax } = await tscDiagnostics(code, { strict: false });
  return syntax.length ? syntax[0] : null;
}

/** Does it survive a STRICT tsc pass? Returns a list of type errors. */
export async function strictTypeErrors(code) {
  const { syntax, types } = await tscDiagnostics(code, { strict: true });
  return [...syntax, ...types];
}

// ── Task definitions. `check` returns { pass, why }. ─────────────────────────
const BASE_FILE = `import { useState } from "react";

interface Props {
  label: string;
  onSave: (value: string) => void;
}

export function NoteEditor({ label, onSave }: Props) {
  const [value, setValue] = useState("");
  return (
    <div className="p-4 rounded border border-gray-200">
      <label className="block text-sm text-gray-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-2 w-full rounded border p-2"
      />
      <button onClick={() => onSave(value)} className="mt-3 bg-blue-600 text-white px-4 py-2 rounded">
        Save
      </button>
    </div>
  );
}
`;

/**
 * A ~250-line realistic file. This is the task that actually separates models
 * in this product: ai_eval_log shows chat.build.primary averaging 27,768 tokens
 * with a 112s median, and the expensive failure mode is not "wrote bad code" —
 * it is "rewrote or truncated a file it was only asked to touch in one place",
 * which then costs a repair round. Short toy prompts never surface that.
 */
function bigFile() {
  const rows = Array.from({ length: 40 }, (_, i) => `  { id: "item-${i}", label: "Item ${i}", weight: ${i * 3 + 1}, active: ${i % 3 !== 0} },`).join("\n");
  return `import { useMemo, useState } from "react";

export interface CatalogItem {
  id: string;
  label: string;
  weight: number;
  active: boolean;
}

export const CATALOG: CatalogItem[] = [
${rows}
];

export type SortKey = "label" | "weight";

export function sortItems(items: CatalogItem[], key: SortKey): CatalogItem[] {
  return [...items].sort((a, b) =>
    key === "label" ? a.label.localeCompare(b.label) : a.weight - b.weight,
  );
}

export function CatalogTable({ onPick }: { onPick: (id: string) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>("label");
  const [showInactive, setShowInactive] = useState(false);
  const visible = useMemo(() => {
    const base = showInactive ? CATALOG : CATALOG.filter((i) => i.active);
    return sortItems(base, sortKey);
  }, [sortKey, showInactive]);

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-3 flex items-center gap-3">
        <button onClick={() => setSortKey("label")} className="rounded bg-gray-100 px-3 py-1 text-sm">
          Sort by label
        </button>
        <button onClick={() => setSortKey("weight")} className="rounded bg-gray-100 px-3 py-1 text-sm">
          Sort by weight
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-gray-500">
            <th className="py-2">Label</th>
            <th className="py-2">Weight</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {visible.map((item) => (
            <tr key={item.id} className="border-t border-gray-100">
              <td className="py-2">{item.label}</td>
              <td className="py-2">{item.weight}</td>
              <td className="py-2 text-right">
                <button onClick={() => onPick(item.id)} className="text-blue-600 hover:underline">
                  Pick
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`;
}

const TASKS = [
  {
    id: "edit-precision",
    max: 3000,
    prompt: `Update this component: change the button background from blue to indigo, and disable the button when the textarea is empty. Return ONLY the complete updated file in one tsx code block. Do not explain.

\`\`\`tsx
${BASE_FILE}\`\`\``,
    async check(text) {
      const code = extractCode(text);
      const err = await tsxParseError(code);
      if (err) return { pass: false, why: `no parse: ${err}` };
      if (!/indigo/.test(code)) return { pass: false, why: "button not indigo" };
      if (/bg-blue-600/.test(code)) return { pass: false, why: "old blue class left in" };
      if (!/disabled/.test(code)) return { pass: false, why: "no disabled state" };
      return { pass: true };
    },
  },
  {
    id: "surgical-restraint",
    max: 3000,
    prompt: `In this component, change ONLY the label text colour from gray-700 to slate-900. Change nothing else. Return ONLY the complete updated file in one tsx code block.

\`\`\`tsx
${BASE_FILE}\`\`\``,
    async check(text) {
      const code = extractCode(text);
      const err = await tsxParseError(code);
      if (err) return { pass: false, why: `no parse: ${err}` };
      if (!/slate-900/.test(code)) return { pass: false, why: "requested change missing" };
      // Everything else must survive. These are the load-bearing bits of the file.
      const mustKeep = [
        "interface Props",
        "onSave: (value: string) => void",
        'useState("")',
        "bg-blue-600",
        "onChange={(e) => setValue(e.target.value)}",
      ];
      const dropped = mustKeep.filter((s) => !code.includes(s));
      if (dropped.length) return { pass: false, why: `rewrote unrelated code (lost ${dropped.length}: ${dropped[0].slice(0, 28)})` };
      return { pass: true };
    },
  },
  {
    id: "component-build",
    max: 4000,
    prompt: `Write ONE self-contained React component in TypeScript with Tailwind: a pricing table with 3 tiers, a monthly/yearly toggle using useState, and a highlighted "Popular" middle tier. Type the plan data with an interface. Return ONLY the code in one tsx code block.`,
    async check(text) {
      const code = extractCode(text);
      const err = await tsxParseError(code);
      if (err) return { pass: false, why: `no parse: ${err}` };
      if (!/useState/.test(code)) return { pass: false, why: "no useState" };
      if (!/className=/.test(code)) return { pass: false, why: "no tailwind classes" };
      if (!/(interface\s+\w+|type\s+\w+\s*=)/.test(code)) return { pass: false, why: "untyped data (no interface/type)" };
      if (!/popular/i.test(code)) return { pass: false, why: "no popular tier" };
      // Accept every real export shape, including `const X = () => {}` followed
      // by a bare `export default X;` — an earlier version of this check only
      // matched `export function|const` and wrongly failed three models that had
      // produced perfectly good components. A benchmark that lies is worse than
      // no benchmark, so keep this permissive and let the parse check do the work.
      if (!/export\s+default\s+\w|export\s+(default\s+)?(function|const|class)\s/.test(code))
        return { pass: false, why: "nothing exported" };
      return { pass: true };
    },
  },
  {
    id: "json-contract",
    max: 1500,
    prompt: `Classify this user request: "make the hero section darker and add a signup button".
Respond with ONLY a JSON object, no prose and no code fence, with exactly these keys:
{"intent": one of "build"|"edit"|"question", "areas": array of strings, "needsClarification": boolean}`,
    async check(text) {
      const raw = String(text ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
      let obj;
      try { obj = JSON.parse(raw); } catch { return { pass: false, why: "not strict JSON" }; }
      if (!["build", "edit", "question"].includes(obj.intent)) return { pass: false, why: `bad intent: ${obj.intent}` };
      if (!Array.isArray(obj.areas)) return { pass: false, why: "areas not an array" };
      if (typeof obj.needsClarification !== "boolean") return { pass: false, why: "needsClarification not boolean" };
      return { pass: true };
    },
  },
  {
    // Instruction-following under an explicit prohibition + a naming contract.
    // Three constraints at once; cheap models routinely drop one.
    id: "strict-contract",
    max: 3000,
    prompt: `Write a React component in TypeScript named exactly \`RateCard\`.
Hard requirements — all three are mandatory:
1. Props interface named exactly \`RateCardProps\` with exactly these fields: \`title: string\`, \`amountCents: number\`, \`onPick: (id: string) => void\`.
2. Use NO \`any\` type anywhere, and add NO comments at all.
3. Format the amount as dollars using Intl.NumberFormat.
Return ONLY the code in one tsx code block.`,
    async check(text) {
      const code = extractCode(text);
      const err = await tsxParseError(code);
      if (err) return { pass: false, why: `no parse: ${err}` };
      if (!/interface\s+RateCardProps/.test(code)) return { pass: false, why: "props interface misnamed" };
      if (!/\bRateCard\b/.test(code)) return { pass: false, why: "component misnamed" };
      if (/:\s*any\b|<any>|as\s+any\b/.test(code)) return { pass: false, why: "used `any` despite prohibition" };
      if (/^\s*\/\/|\/\*/m.test(code)) return { pass: false, why: "added comments despite prohibition" };
      if (!/Intl\.NumberFormat/.test(code)) return { pass: false, why: "no Intl.NumberFormat" };
      for (const f of ["amountCents", "onPick", "title"]) {
        if (!code.includes(f)) return { pass: false, why: `missing prop ${f}` };
      }
      return { pass: true };
    },
  },
  {
    // A stale-closure bug. A cosmetic "fix" won't pass: the update must be
    // functional (or use a ref / a real dep), AND the interval must be cleaned up.
    id: "subtle-bug-fix",
    max: 3000,
    prompt: `This component is meant to increment once per second but it sticks at 1. Fix the bug and return ONLY the complete corrected file in one tsx code block.

\`\`\`tsx
import { useEffect, useState } from "react";

export function Ticker() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setInterval(() => setCount(count + 1), 1000);
  }, []);
  return <div>{count}</div>;
}
\`\`\``,
    async check(text) {
      const code = extractCode(text);
      const err = await tsxParseError(code);
      if (err) return { pass: false, why: `no parse: ${err}` };
      const functional = /setCount\(\s*\(?\s*\w+\s*\)?\s*=>/.test(code);
      const depFix = /\}\s*,\s*\[\s*count\s*\]\s*\)/.test(code);
      const usesRef = /useRef/.test(code);
      if (!functional && !depFix && !usesRef) return { pass: false, why: "stale closure not actually fixed" };
      if (!/clearInterval/.test(code)) return { pass: false, why: "interval never cleaned up (leak)" };
      return { pass: true };
    },
  },
  {
    // Does the output survive a STRICT tsc pass, not merely parse?
    id: "strict-typecheck",
    max: 3500,
    prompt: `Write a self-contained TypeScript module (no React, no imports) exporting a function \`groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]>\`, fully typed and strict-mode clean. Do not use \`any\`. Return ONLY the code in one ts code block.`,
    async check(text) {
      const code = extractCode(text);
      const errs = await strictTypeErrors(code);
      if (errs.length) return { pass: false, why: `${errs.length} strict TS error(s): ${errs[0]}` };
      if (!/groupBy/.test(code)) return { pass: false, why: "no groupBy export" };
      if (/:\s*any\b|<any>/.test(code)) return { pass: false, why: "used any" };
      return { pass: true };
    },
  },
  {
    // Large-context surgical edit. One change, ~250 lines of context. Failing
    // this is the real-world repair-round driver.
    id: "large-file-surgical",
    max: 8000,
    hard: true,
    prompt: `Here is a file. Add a THIRD sort option "id" — extend the SortKey type, handle it in sortItems, and add a matching button. Change nothing else. Return ONLY the complete updated file in one tsx code block.

\`\`\`tsx
${bigFile()}\`\`\``,
    async check(text) {
      const code = extractCode(text);
      const err = await tsxParseError(code);
      if (err) return { pass: false, why: `no parse: ${err}` };
      if (!/"id"/.test(code) || !/SortKey\s*=\s*[^;]*"id"/.test(code)) return { pass: false, why: "SortKey not extended with id" };
      // The whole catalog must survive — truncating it is the classic failure.
      const kept = (code.match(/id: "item-\d+"/g) ?? []).length;
      if (kept < 40) return { pass: false, why: `dropped catalog rows (${kept}/40 survived)` };
      for (const s of ["showInactive", "localeCompare", "useMemo", "onPick"]) {
        if (!code.includes(s)) return { pass: false, why: `lost unrelated code: ${s}` };
      }
      return { pass: true };
    },
  },
  {
    id: "tanstack-start-route",
    max: 5000,
    prompt: `Create a TanStack Start route file at \`src/routes/app/dashboard.tsx\` with:
- A loader that fetches user data from Supabase (use createServerFn)
- A component that renders the user's name and email
- Proper TypeScript types for the loader data
- Export the route with createFileRoute
Return ONLY the complete file in one tsx code block.`,
    async check(text) {
      const code = extractCode(text);
      const err = await tsxParseError(code);
      if (err) return { pass: false, why: `no parse: ${err}` };
      const checks = [
        { pattern: /createFileRoute/, msg: "missing createFileRoute" },
        { pattern: /createServerFn/, msg: "missing createServerFn" },
        { pattern: /loader/, msg: "missing loader" },
        { pattern: /Supabase|supabase/, msg: "no Supabase reference" },
        { pattern: /interface\s+\w+LoaderData|type\s+\w+LoaderData/, msg: "no loader data type" },
        { pattern: /export\s+default.*Route/, msg: "no route export" },
      ];
      for (const { pattern, msg } of checks) {
        if (!pattern.test(code)) return { pass: false, why: msg };
      }
      return { pass: true };
    },
  },
  {
    id: "tanstack-router-link",
    max: 3000,
    prompt: `Write a TanStack Router Link component that:
- Uses \`Link\` from \`@tanstack/react-router\`
- Has an active style (underline when active)
- Accepts \`to\` and \`children\` props
- Returns a typed component with proper interface
Return ONLY the complete file in one tsx code block.`,
    async check(text) {
      const code = extractCode(text);
      const err = await tsxParseError(code);
      if (err) return { pass: false, why: `no parse: ${err}` };
      if (!/@tanstack\/react-router/.test(code)) return { pass: false, why: "missing import" };
      if (!/Link/.test(code)) return { pass: false, why: "no Link" };
      if (!/active.*style|isActive/.test(code)) return { pass: false, why: "no active style" };
      if (!/interface\s+\w+Props|type\s+\w+Props/.test(code)) return { pass: false, why: "no props type" };
      return { pass: true };
    },
  },
];

/** A model that ran out of budget mid-file is TRUNCATED, not broken — scoring
 *  those as syntax errors would defame verbose-but-correct models. */
async function call(model, prompt, max_tokens) {
  const t0 = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lifemarkai.com",
        "X-Title": "LifemarkAI model benchmark",
      },
      body: JSON.stringify({ model, max_tokens, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(180000),
    });
    const json = await res.json();
    const ms = Date.now() - t0;
    if (!res.ok || json.error) return { ms, err: String(json.error?.message ?? res.status).slice(0, 70) };
    return {
      ms,
      text: json.choices?.[0]?.message?.content ?? "",
      inTok: json.usage?.prompt_tokens ?? 0,
      outTok: json.usage?.completion_tokens ?? 0,
      truncated: json.choices?.[0]?.finish_reason === "length",
    };
  } catch (e) {
    return { ms: Date.now() - t0, err: String(e.message).slice(0, 70) };
  }
}

const usd = (model, inTok, outTok) => {
  const [i, o] = PRICES[model] ?? [1, 5];
  return (inTok * i + outTok * o) / 1e6;
};

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

async function main() {
  const suite = arg("suite", "coding");
  const runs = Number(arg("runs", "2"));
  const models = arg("models", "") ? arg("models", "").split(",") : SUITES[suite];
  if (!models) { console.error(`Unknown suite "${suite}". Try: ${Object.keys(SUITES).join(", ")}`); process.exit(1); }

  const hard = process.argv.includes("--hard");
  const tasks = TASKS.filter((t) => (t.hard ? hard : !process.argv.includes("--only-hard")));
  console.log(`suite=${suite}  runs=${runs}  tasks=${tasks.length}${hard ? " (incl. large-context)" : ""}  models=${models.length}\n`);
  const rows = [];

  for (const model of models) {
    const lat = [];
    let cost = 0, passed = 0, total = 0;
    const failures = [];
    for (const task of tasks) {
      for (let r = 0; r < runs; r++) {
        total++;
        const out = await call(model, task.prompt, task.max);
        if (out.err) { failures.push(`${task.id}: ${out.err}`); continue; }
        if (out.truncated) { failures.push(`${task.id}: TRUNCATED at ${task.max} tokens (too verbose)`); lat.push(out.ms); cost += usd(model, out.inTok, out.outTok); continue; }
        lat.push(out.ms);
        cost += usd(model, out.inTok, out.outTok);
        const verdict = await task.check(out.text);
        if (verdict.pass) passed++;
        else failures.push(`${task.id}: ${verdict.why}`);
      }
    }
    rows.push({ model, passed, total, p50: median(lat), cost, failures });
    console.log(
      `${model.padEnd(40)} ${String(passed).padStart(2)}/${total}  p50=${String(median(lat)).padStart(6)}ms  $${cost.toFixed(5)}`,
    );
    for (const f of failures.slice(0, 4)) console.log(`${" ".repeat(42)}✗ ${f}`);
  }

  console.log("\n── ranked by pass rate, then latency ──");
  rows
    .sort((a, b) => b.passed / b.total - a.passed / a.total || a.p50 - b.p50)
    .forEach((r, i) =>
      console.log(
        `${String(i + 1).padStart(2)}. ${r.model.padEnd(40)} ${Math.round((r.passed / r.total) * 100)}%  ${r.p50}ms  $${r.cost.toFixed(5)}`,
      ),
    );
}

// Only run the suite when invoked directly — the test file imports the checkers.
if (process.argv[1] && process.argv[1].endsWith("eval-models.mjs")) main();
