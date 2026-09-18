import {
  buildFallbackProjectContract,
  contractHasErrors,
  extractJsonObject,
  parseProjectContract,
  type ParsedProjectContract,
  type ProjectContract,
} from "./project-contract.ts";
import { buildProjectContractPrompt } from "./project-contract-prompt.ts";
import { logger } from "../logger.ts";
import { recordEvent } from "../observability/events.ts";

export interface ProjectContractStageResult {
  contract: ProjectContract;
  generationOrder: string[];
  source: "model" | "fallback";
  tokensUsed: number;
  issues: ParsedProjectContract["issues"];
}

export type ContractModelMessage = { role: "system" | "user" | "assistant"; content: string };

export async function completeProjectContract(opts: {
  prompt: string;
  projectId?: string;
  generate: (args: {
    messages: ContractModelMessage[];
    task: string;
  }) => Promise<{ content: string; tokensUsed: number }>;
}): Promise<ProjectContractStageResult> {
  const fallback = buildFallbackProjectContract(opts.prompt);
  let tokensUsed = 0;

  const parseModel = (text: string): ParsedProjectContract | null => {
    try {
      return parseProjectContract(extractJsonObject(text), { prompt: opts.prompt, fallback });
    } catch {
      return null;
    }
  };

  try {
    const first = await opts.generate({
      messages: [
        { role: "system", content: "You output only JSON. No markdown, no commentary." },
        { role: "user", content: buildProjectContractPrompt(opts.prompt) },
      ],
      task: "chat.build.contract",
    });
    tokensUsed += first.tokensUsed;
    let parsed = parseModel(first.content);

    if (!parsed || contractHasErrors(parsed)) {
      const detail = (parsed?.issues ?? [])
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message)
        .slice(0, 8)
        .join("; ") || "contract JSON was invalid";
      const retry = await opts.generate({
        messages: [
          { role: "system", content: "You output only JSON. No markdown, no commentary." },
          { role: "user", content: buildProjectContractPrompt(opts.prompt) },
          { role: "assistant", content: first.content.slice(0, 8_000) },
          {
            role: "user",
            content: `The contract failed validation: ${detail}. Return a corrected JSON object that satisfies every hard rule.`,
          },
        ],
        task: "chat.build.contract_retry",
      });
      tokensUsed += retry.tokensUsed;
      parsed = parseModel(retry.content) ?? parsed;
    }

    if (parsed && !contractHasErrors(parsed)) {
      recordEvent("generation_contract_completed", {
        source: "model",
        fileCount: parsed.contract.files.length,
        routeCount: parsed.contract.routes.length,
        tokensUsed,
      });
      return {
        contract: parsed.contract,
        generationOrder: parsed.generationOrder,
        source: "model",
        tokensUsed,
        issues: parsed.issues,
      };
    }

    logger.warn("ai.chat.project_contract_fallback", {
      projectId: opts.projectId,
      issues: parsed?.issues.map((issue) => issue.code) ?? ["unparseable"],
    });
  } catch (error) {
    logger.warn("ai.chat.project_contract_failed", {
      projectId: opts.projectId,
      error: String(error),
    });
  }

  const parsedFallback = parseProjectContract(fallback, { fallback });
  recordEvent("generation_contract_completed", {
    source: "fallback",
    fileCount: fallback.files.length,
    routeCount: fallback.routes.length,
    tokensUsed,
  });
  return {
    contract: fallback,
    generationOrder: parsedFallback.generationOrder,
    source: "fallback",
    tokensUsed,
    issues: parsedFallback.issues,
  };
}
