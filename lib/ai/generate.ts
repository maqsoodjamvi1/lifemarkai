/**
 * Primary AI generate entrypoint.
 *
 * Routes through the AI Gateway Worker when LIFEMARK_GATEWAY_URL is set,
 * falls back to the direct provider.ts path otherwise (local dev / self-hosted).
 *
 * Import from here (or @/lib/ai/provider directly) — both paths work.
 */
import { generateAI as generateDirect } from "./provider";
import { generateViaGateway, isGatewayAvailable } from "./gateway-client";
export type { GenerateOptions, GenerateResult, AIMessage, AIModel } from "./provider";

export { generateDirect as generateDirectAI };

export async function generateAI(
  options: Parameters<typeof generateDirect>[0],
  ctx?: { projectId?: string; userId?: string }
): ReturnType<typeof generateDirect> {
  if (isGatewayAvailable()) {
    return generateViaGateway(options, ctx);
  }
  return generateDirect(options);
}
