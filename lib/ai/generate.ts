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
import { assertOpenRouterCredit, routesViaOpenRouter } from "./openrouter-credits";
import { recordAiEval } from "./eval-log";
export type { GenerateOptions, GenerateResult, AIMessage, AIModel } from "./provider";

export { generateDirect as generateDirectAI };

export async function generateAI(
  options: Parameters<typeof generateDirect>[0],
  ctx?: { projectId?: string; userId?: string; task?: string }
): ReturnType<typeof generateDirect> {
  // Clamp the output budget per-model on BOTH paths (the gateway path doesn't
  // go through provider.ts, so clamp here too) — keeps 64K requests safe when a
  // model only supports less.
  const model = options.model ?? getDefaultAiModel();
  options = { ...options, maxTokens: clampMaxTokens(model, options.maxTokens) };

  // Pre-flight guard: never overdraw the OpenRouter account. Blocks only when the
  // balance is CONFIRMED depleted (fail-open otherwise); cached ~60s so it adds
  // at most one balance check per minute across all requests.
  if (routesViaOpenRouter(model)) {
    await assertOpenRouterCredit();
  }

  // Observe every call (fire-and-forget; never blocks or throws) so model-tier
  // changes are visible in ai_eval_log instead of shipping blind.
  const viaGateway = isGatewayAvailable();
  const startedAt = Date.now();
  try {
    const result = viaGateway
      ? await generateViaGateway(options, ctx)
      : await generateDirect(options);
    recordAiEval({
      model,
      task: ctx?.task,
      projectId: ctx?.projectId,
      userId: ctx?.userId,
      latencyMs: Date.now() - startedAt,
      tokensUsed: result.tokensUsed,
      toolCalls: result.toolCalls?.length ?? 0,
      success: true,
      viaGateway,
    });
    return result;
  } catch (err) {
    recordAiEval({
      model,
      task: ctx?.task,
      projectId: ctx?.projectId,
      userId: ctx?.userId,
      latencyMs: Date.now() - startedAt,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      viaGateway,
    });
    throw err;
  }
}
