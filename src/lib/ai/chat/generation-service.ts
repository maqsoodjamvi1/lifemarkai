import { generateAI } from "../generate.ts";

export type GenerationStageRequest = Parameters<typeof generateAI>[0];
export type GenerationStageContext = Parameters<typeof generateAI>[1];

/**
 * Single provider boundary for the chat pipeline.
 *
 * Route handlers describe a generation stage; this service owns provider
 * invocation so routing, tracing, retries, and cancellation can evolve without
 * growing the HTTP controller again.
 */
export async function runGenerationStage(
  request: GenerationStageRequest,
  context?: GenerationStageContext,
) {
  return generateAI(request, context);
}
