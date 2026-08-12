/**
 * Primary AI generate entrypoint.
 *
 * Routes through the AI Gateway Worker when LIFEMARK_GATEWAY_URL is set,
 * falls back to the direct provider.ts path otherwise (local dev / self-hosted).
 *
 * Application code must import from here. provider.ts is the direct transport
 * implementation and is reserved for this module and tightly scoped tooling.
 */
import { generateAI as generateDirect,clampMaxTokens } from "./provider.ts";
import { generateViaGateway,isGatewayAvailable } from "./gateway-client.ts";
import { getDefaultAiModel } from "./model-defaults.ts";
import { assertOpenRouterCredit,routesViaOpenRouter } from "./openrouter-credits.ts";
import { recordAiEval } from "./eval-log.ts";
import { toFriendlyProviderError } from "./provider-error.ts";
export type { GenerateOptions, GenerateResult, AIMessage, AIModel } from "./provider.ts";

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
    // Improvement #6: surface one actionable sentence (401/402/429/5xx) to the
    // caller while keeping the raw provider error as `cause` for logs.
    throw toFriendlyProviderError(err);
  }
}
