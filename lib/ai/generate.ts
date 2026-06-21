/**
 * Primary AI generate entrypoint.
 *
 * Routes through the AI Gateway Worker when LIFEMARK_GATEWAY_URL is set,
 * falls back to the direct provider.ts path otherwise (local dev / self-hosted).
 *
 * Import from here (or @/lib/ai/provider directly) — both paths work.
 */
import { generateAI as generateDirect, clampMaxTokens } from "./provider";
import { generateViaGateway, isGatewayAvailable } from "./gateway-client";
import { getDefaultAiModel } from "./model-defaults";
export type { GenerateOptions, GenerateResult, AIMessage, AIModel } from "./provider";

export { generateDirect as generateDirectAI };

export async function generateAI(
  options: Parameters<typeof generateDirect>[0],
  ctx?: { projectId?: string; userId?: string }
): ReturnType<typeof generateDirect> {
  // Clamp the output budget per-model on BOTH paths (the gateway path doesn't
  // go through provider.ts, so clamp here too) — keeps 64K requests safe when a
  // model only supports less.
  const model = options.model ?? getDefaultAiModel();
  options = { ...options, maxTokens: clampMaxTokens(model, options.maxTokens) };

  if (isGatewayAvailable()) {
    return generateViaGateway(options, ctx);
  }
  return generateDirect(options);
}
