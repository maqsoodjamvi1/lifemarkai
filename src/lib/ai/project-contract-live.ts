/**
 * Live architect-stage experiment.
 *
 * Full 20–50 greenfield *builds* cost minutes and credits each. This runner
 * measures the contract-first gate those builds now depend on: one architect
 * pass per prompt, then validate the TanStack scaffold against that contract
 * before any install.
 *
 * Talks to OpenRouter/OpenAI with fetch so the CLI never loads the app's
 * Vite/Supabase runtime. Requires OPENROUTER_API_KEY or OPENAI_API_KEY.
 */
import { tanstackStartScaffold } from "../templates/tanstack-start-scaffold.ts";
import { CONTRACT_EXPERIMENT_PROMPTS } from "./project-contract-experiment.ts";
import { ensureContractFile } from "./project-contract.ts";
import { scoreContractAgainstScaffold } from "./project-contract-validate.ts";
import { completeProjectContract } from "./project-contract-complete.ts";
import { createGenerationAttempt } from "./generation-attempt.ts";
import { runDurableStep } from "./generation-loop.ts";

const EXTRA_LIVE_PROMPTS = [
  "Build a spa booking landing page",
  "Build a wedding photographer site",
  "Build a local plumber website",
  "Build a boutique hotel landing page",
  "Build a language tutoring site",
  "Build a coworking space website",
  "Build a pediatric clinic marketing site",
  "Build a craft brewery landing page",
  "Build a cycling shop website",
  "Build a vegan cafe landing page",
];

export const LIVE_CONTRACT_PROMPTS = [...CONTRACT_EXPERIMENT_PROMPTS, ...EXTRA_LIVE_PROMPTS];

export interface LiveArchitectRun {
  id: string;
  prompt: string;
  source: "model" | "fallback";
  architectOk: boolean;
  scaffoldAligned: boolean;
  extraProduct: number;
  durationMs: number;
  tokensUsed: number;
  fileCount: number;
  routeCount: number;
  errorCount: number;
  families: string;
}

export interface LiveArchitectReport {
  runs: number;
  modelSource: number;
  fallbackSource: number;
  architectSuccesses: number;
  architectSuccessRate: number;
  scaffoldAligned: number;
  extraProduct: number;
  meanDurationMs: number;
  meanTokensUsed: number;
  results: LiveArchitectRun[];
}

export function hasLiveArchitectKeys(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
}

function architectEndpoint(): { url: string; headers: Record<string, string>; model: string } {
  const openRouter = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouter) {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: {
        Authorization: `Bearer ${openRouter}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lifemarkai.app",
        "X-Title": "LifemarkAI contract experiment",
      },
      model: process.env.OPENROUTER_CHAT_MODEL?.trim() || "openai/gpt-4.1-mini",
    };
  }
  const openAi = process.env.OPENAI_API_KEY?.trim();
  if (!openAi) throw new Error("OPENROUTER_API_KEY or OPENAI_API_KEY is required");
  return {
    url: "https://api.openai.com/v1/chat/completions",
    headers: {
      Authorization: `Bearer ${openAi}`,
      "Content-Type": "application/json",
    },
    model: process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4.1-mini",
  };
}

async function generateContractJson(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<{ content: string; tokensUsed: number }> {
  const endpoint = architectEndpoint();
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: endpoint.headers,
    body: JSON.stringify({
      model: endpoint.model,
      temperature: 0,
      max_tokens: 3_500,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Architect HTTP ${response.status}: ${detail.slice(0, 240)}`);
  }
  const body = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  return {
    content: body.choices?.[0]?.message?.content ?? "",
    tokensUsed: body.usage?.total_tokens ?? 0,
  };
}

export async function runLiveArchitectExperiment(opts: {
  runs?: number;
  projectId?: string;
}): Promise<LiveArchitectReport> {
  const runs = Math.min(50, Math.max(1, opts.runs ?? 20));
  const prompts = Array.from(
    { length: runs },
    (_, index) => LIVE_CONTRACT_PROMPTS[index % LIVE_CONTRACT_PROMPTS.length]!,
  );
  const results: LiveArchitectRun[] = [];

  for (const [index, prompt] of prompts.entries()) {
    const started = Date.now();
    const attempt = createGenerationAttempt(opts.projectId);
    try {
      const staged = await runDurableStep({
        attempt,
        step: "contract",
        persist: false,
        timeoutMs: 180_000,
        tokensOf: (result) => result.tokensUsed,
        fn: () =>
          completeProjectContract({
            prompt,
            projectId: opts.projectId ?? "experiment-contract",
            generate: ({ messages }) => generateContractJson(messages),
          }),
      });
      const files = ensureContractFile(tanstackStartScaffold({}, prompt.slice(0, 40)), staged.contract);
      const score = scoreContractAgainstScaffold(staged.contract, files);
      const families = [
        ...score.requiredMissing.map((path) => `missing:${path}`),
        ...score.forbidden.map((path) => `forbidden:${path}`),
      ].join(",") || (score.extraProduct.length > 0 ? `extra:${score.extraProduct.length}` : "none");
      results.push({
        id: `live-${index + 1}`,
        prompt,
        source: staged.source,
        architectOk: staged.source === "model",
        scaffoldAligned: score.requiredCovered,
        extraProduct: score.extraProduct.length,
        durationMs: Date.now() - started,
        tokensUsed: staged.tokensUsed,
        fileCount: staged.contract.files.length,
        routeCount: staged.contract.routes.length,
        errorCount: score.requiredMissing.length + score.forbidden.length,
        families,
      });
      console.error(
        `[live ${index + 1}/${runs}] ${staged.source} required=${score.requiredCovered ? "ok" : "gap"} extra=${score.extraProduct.length} files=${staged.contract.files.length} tokens=${staged.tokensUsed} ${Date.now() - started}ms — ${prompt}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: `live-${index + 1}`,
        prompt,
        source: "fallback",
        architectOk: false,
        scaffoldAligned: false,
        extraProduct: 0,
        durationMs: Date.now() - started,
        tokensUsed: 0,
        fileCount: 0,
        routeCount: 0,
        errorCount: 1,
        families: message.slice(0, 80),
      });
      console.error(`[live ${index + 1}/${runs}] error ${message.slice(0, 160)} — ${prompt}`);
    }
  }

  const architectSuccesses = results.filter((result) => result.architectOk).length;
  const scaffoldAligned = results.filter((result) => result.scaffoldAligned).length;
  return {
    runs: results.length,
    modelSource: architectSuccesses,
    fallbackSource: results.filter((result) => result.source === "fallback").length,
    architectSuccesses,
    architectSuccessRate: architectSuccesses / results.length,
    scaffoldAligned,
    extraProduct: results.reduce((sum, result) => sum + result.extraProduct, 0),
    meanDurationMs: results.reduce((sum, result) => sum + result.durationMs, 0) / results.length,
    meanTokensUsed: results.reduce((sum, result) => sum + result.tokensUsed, 0) / results.length,
    results,
  };
}

export function formatLiveArchitectReport(report: LiveArchitectReport): string {
  const rows = report.results
    .map(
      (result) =>
        `  ${result.id.padEnd(8)} ${result.source.padEnd(8)} architect=${result.architectOk ? "ok" : "fallback"} required=${result.scaffoldAligned ? "ok" : "gap"} extra=${result.extraProduct} files=${result.fileCount} tokens=${result.tokensUsed} ${result.durationMs}ms`,
    )
    .join("\n");
  return [
    `Live architect experiment: ${report.runs} runs`,
    `Parseable model contracts: ${report.architectSuccesses}/${report.runs} (${(report.architectSuccessRate * 100).toFixed(1)}%)`,
    `Fallback contracts: ${report.fallbackSource}/${report.runs}`,
    `Required scaffold files covered: ${report.scaffoldAligned}/${report.runs}`,
    `Extra product files planned for generate: ${report.extraProduct}`,
    `Mean duration: ${report.meanDurationMs.toFixed(0)}ms  mean tokens: ${report.meanTokensUsed.toFixed(0)}`,
    rows,
  ].join("\n");
}
