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
import { correlationFields } from "../observability/correlation.ts";
import { recordEvent } from "../observability/events.ts";
import { isFeatureEnabled } from "../config/features.ts";
import { AiSdkTransportError,generateViaVercelAiSdk } from "./vercel-ai-adapter.ts";
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

  // Phase 0: most call sites pass no ctx at all, so ai_eval_log rows arrive
  // with null project/user and cannot be attributed. The request already knows
  // both — take them from the correlation context when the caller did not pass
  // them. An explicit ctx always wins; this only fills gaps.
  const correlation = correlationFields();
  ctx = {
    ...ctx,
    projectId: ctx?.projectId ?? correlation.projectId,
    userId: ctx?.userId ?? correlation.userId,
  };

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
    const result = await runThroughSelectedAdapter(options, ctx, viaGateway);
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
    recordEvent("ai_generation_completed", {
      model,
      task: ctx?.task,
      durationMs: Date.now() - startedAt,
      tokensUsed: result.tokensUsed,
      toolCallCount: result.toolCalls?.length ?? 0,
      viaGateway,
      success: true,
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
    recordEvent("ai_generation_failed", {
      model,
      task: ctx?.task,
      durationMs: Date.now() - startedAt,
      viaGateway,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
    // Improvement #6: surface one actionable sentence (401/402/429/5xx) to the
    // caller while keeping the raw provider error as `cause` for logs.
    throw toFriendlyProviderError(err);
  }
}


/**
 * Phase 4 adapter selection. The Vercel AI SDK path runs only when the
 * `vercelAiSdk` flag resolves ON for this user/project AND the request has no
 * jsonMode (the SDK adapter does not implement the prefill trick yet — those
 * requests stay legacy rather than silently changing behaviour).
 *
 * Fallback is for TRANSPORT problems only (AiSdkTransportError: SDK not
 * installed, provider construction failed). A model error thrown by the SDK
 * path propagates — re-running it on the legacy adapter would double-charge
 * exactly the expensive failures (the plan's no-duplicate-charges criterion).
 */
async function runThroughSelectedAdapter(
  options: Parameters<typeof generateDirect>[0],
  ctx: { projectId?: string; userId?: string; task?: string } | undefined,
  viaGateway: boolean,
) {
  const wantSdk =
    !options.jsonMode &&
    isFeatureEnabled("vercelAiSdk", { userId: ctx?.userId, projectId: ctx?.projectId });

  if (wantSdk) {
    try {
      return await generateViaVercelAiSdk(options);
    } catch (err) {
      if (!(err instanceof AiSdkTransportError)) throw err;
      // Streaming requests may have already emitted chunks; a transport error
      // is thrown before the first byte in this adapter, so the legacy retry
      // starts a clean stream.
      recordEvent("ai_generation_failed", {
        adapter: "vercel-ai-sdk",
        fallback: "legacy",
        error: err.message,
        success: false,
      });
    }
  }

  return viaGateway ? generateViaGateway(options, ctx) : generateDirect(options);
}
