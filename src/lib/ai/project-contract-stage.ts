import { runGenerationStage } from "./chat/generation-service.ts";
import { classifyBuildIntent } from "./build-intent.ts";
import {
  completeProjectContract,
  type ProjectContractStageResult,
} from "./project-contract-complete.ts";

export type { ProjectContractStageResult };

export async function runProjectContractStage(opts: {
  prompt: string;
  projectId: string;
  userId: string;
  model: string;
}): Promise<ProjectContractStageResult> {
  return completeProjectContract({
    prompt: opts.prompt,
    projectId: opts.projectId,
    generate: async ({ messages, task }) => {
      let content = "";
      const result = await runGenerationStage(
        {
          model: opts.model,
          messages,
          maxTokens: Math.min(9_000, Math.max(3_500, classifyBuildIntent(opts.prompt).minFiles * 300)),
          jsonMode: true,
          onChunk: (chunk) => {
            content += chunk;
          },
        },
        { projectId: opts.projectId, userId: opts.userId, task },
      );
      return { content, tokensUsed: result.tokensUsed ?? 0 };
    },
  });
}
