import { ECONOMY_CODING_MODEL,ESCALATION_MODEL } from "../model-defaults.ts";
import { parseAIResponse,type ParsedFile } from "../code-parser.ts";
import { AUTO_FIX_SYSTEM_PROMPT,buildRepairPrompt } from "../system-prompts.ts";
import { prepareGeneratedFiles } from "./validation-service.ts";
import { runGenerationStage } from "./generation-service.ts";

export type RepairStageOptions = {
  files: ParsedFile[];
  existingFiles: ParsedFile[];
  errors: string[];
  blueprint?: string;
  needsEnrichment: boolean;
  majorGreenfield: boolean;
  simpleEconomyRequest: boolean;
  maxTokens: number;
  projectId: string;
  userId: string;
};

export type RepairStageResult = {
  files: ParsedFile[];
  tokenEstimate: number;
};

/**
 * One bounded repair attempt. The caller owns the maximum number of rounds;
 * this service owns prompt construction, repair-model choice, parsing, and
 * deterministic merge semantics.
 */
export async function runRepairStage(
  options: RepairStageOptions,
): Promise<RepairStageResult | null> {
  const repairPrompt = buildRepairPrompt(
    options.files,
    options.errors,
    options.needsEnrichment ? options.blueprint : undefined,
  );
  const repairModel =
    options.needsEnrichment || options.majorGreenfield
      ? ESCALATION_MODEL
      : options.simpleEconomyRequest
        ? ECONOMY_CODING_MODEL
        : ESCALATION_MODEL;
  let repairContent = "";

  await runGenerationStage(
    {
      model: repairModel,
      messages: [
        {
          role: "system" as const,
          content: options.needsEnrichment
            ? "You are LifemarkAI Build Engine. Follow the user message exactly and respond with ONLY the required JSON object."
            : AUTO_FIX_SYSTEM_PROMPT,
        },
        { role: "user" as const, content: repairPrompt },
      ],
      maxTokens: options.maxTokens,
      stream: true,
      jsonMode: true,
      onChunk: (chunk) => {
        repairContent += chunk;
      },
    },
    {
      projectId: options.projectId,
      userId: options.userId,
      task: "chat.build.autofix",
    },
  );

  const repaired = parseAIResponse(repairContent);
  if (repaired.files.length === 0) return null;

  const merged = new Map(options.files.map((file) => [file.path, file]));
  for (const file of repaired.files) merged.set(file.path, file);
  return {
    files: prepareGeneratedFiles(Array.from(merged.values()), options.existingFiles),
    tokenEstimate: 1_000,
  };
}
