/**
 * Vercel AI SDK adapter — Phase 4 of the Vercel adoption plan.
 *
 * A second implementation of the generateAI() transport, behind the
 * `vercelAiSdk` flag, that speaks through the Vercel AI SDK (`ai` package)
 * instead of the hand-rolled provider clients in provider.ts. The PUBLIC
 * contract does not move: callers keep GenerateOptions in and GenerateResult
 * out, streaming keeps calling onChunk with plain text deltas, tool calls
 * come back as the same ToolCall shape, and maxTokens clamping/attribution
 * still happen in generate.ts above both adapters.
 *
 * The `ai` package is loaded dynamically and probed once:
 *   - not installed  → adapter reports unavailable, legacy path runs, and a
 *     single structured event records that the flag was on but inert. This is
 *     what lets the flag be enabled in config BEFORE `npm install ai` lands,
 *     and what makes rollback a pure env flip.
 *   - installed      → requests route through the SDK against the same
 *     OpenRouter endpoint (OpenAI-compatible), so an A/B compares TRANSPORTS,
 *     not model families — the plan's fairness requirement.
 *
 * Fallback policy (the plan is explicit here): fall back to the legacy
 * adapter ONLY for transport incompatibility — SDK missing, SDK threw a
 * shape/conversion error before or during the request. Model-quality
 * failures (bad code, refusals, empty output) are NOT retried on the other
 * adapter: that would double the cost of exactly the requests that are
 * already the most expensive.
 */
import type { GenerateOptions, GenerateResult, ToolCall } from "./provider.ts";
import { getDefaultAiModel } from "./model-defaults.ts";
import { recordEvent } from "../observability/events.ts";

type VercelAiModule = {
  generateText: (options: Record<string, unknown>) => Promise<{
    text: string;
    usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number };
    toolCalls?: Array<{ toolCallId: string; toolName: string; args: unknown }>;
  }>;
  streamText: (options: Record<string, unknown>) => {
    textStream: AsyncIterable<string>;
    usage: Promise<{ totalTokens?: number }>;
    text: Promise<string>;
  };
  jsonSchema: (schema: Record<string, unknown>) => unknown;
  tool: (definition: Record<string, unknown>) => unknown;
};

type OpenAiProviderModule = {
  createOpenAI: (config: { baseURL?: string; apiKey?: string }) => (model: string) => unknown;
};

/** Thrown for problems that are the TRANSPORT's fault, never the model's. */
export class AiSdkTransportError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AiSdkTransportError";
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause;
  }
}

let probe: Promise<{ ai: VercelAiModule; openai: OpenAiProviderModule } | null> | null = null;

/**
 * Load the SDK once per process. Returns null (and remembers it) when the
 * packages are not installed — the adapter is then permanently unavailable
 * for this process and the legacy path runs without further probing cost.
 */
function loadSdk(): Promise<{ ai: VercelAiModule; openai: OpenAiProviderModule } | null> {
  if (!probe) {
    probe = (async () => {
      try {
        // Literal-free specifiers defeat bundler static analysis: the worker
        // bundle must not fail to BUILD because an optional package is absent.
        const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
        const ai = (await dynamicImport("ai")) as VercelAiModule;
        const openai = (await dynamicImport("@ai-sdk/openai")) as OpenAiProviderModule;
        if (typeof ai.generateText !== "function" || typeof openai.createOpenAI !== "function") {
          return null;
        }
        return { ai, openai };
      } catch {
        return null;
      }
    })();
  }
  return probe;
}

export async function isVercelAiSdkAvailable(): Promise<boolean> {
  return (await loadSdk()) !== null;
}

/** Test seam: reset the probe cache (module-level state survives test files). */
export function resetVercelAiSdkProbe(): void {
  probe = null;
}

function resolveModelId(model: string): { baseURL: string; apiKey: string | undefined; modelId: string } {
  // Same upstream the legacy adapter uses for slash models, so the A/B holds
  // the model constant and varies only the transport.
  return {
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    modelId: model,
  };
}

function toSdkMessages(messages: GenerateOptions["messages"]): Array<{ role: string; content: string }> {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

function toSdkTools(
  ai: VercelAiModule,
  tools: NonNullable<GenerateOptions["tools"]>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const definition of tools) {
    out[definition.name] = ai.tool({
      description: definition.description,
      parameters: ai.jsonSchema(definition.parameters),
    });
  }
  return out;
}

function normalizeToolCalls(
  raw: Array<{ toolCallId: string; toolName: string; args: unknown }> | undefined,
): ToolCall[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map((call) => ({
    id: call.toolCallId,
    name: call.toolName,
    args: (call.args && typeof call.args === "object" ? call.args : {}) as Record<string, unknown>,
  }));
}

/**
 * Run one generation through the Vercel AI SDK.
 * Throws AiSdkTransportError for transport-level problems (caller falls back);
 * rethrows provider/model errors untouched (caller must NOT fall back).
 */
export async function generateViaVercelAiSdk(options: GenerateOptions): Promise<GenerateResult> {
  const sdk = await loadSdk();
  if (!sdk) {
    throw new AiSdkTransportError("Vercel AI SDK is not installed (npm install ai @ai-sdk/openai)");
  }
  const model = options.model ?? getDefaultAiModel();
  const { baseURL, apiKey, modelId } = resolveModelId(model);
  if (!apiKey) {
    throw new AiSdkTransportError("OPENROUTER_API_KEY is not set for the AI SDK adapter");
  }

  let provider: unknown;
  try {
    provider = sdk.openai.createOpenAI({ baseURL, apiKey })(modelId);
  } catch (err) {
    throw new AiSdkTransportError("AI SDK provider construction failed", err);
  }

  const base: Record<string, unknown> = {
    model: provider,
    messages: toSdkMessages(options.messages),
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  };

  const startedAt = Date.now();

  // Tools force non-streaming (same rule as the legacy adapter).
  if (options.tools?.length) {
    const result = await sdk.ai.generateText({
      ...base,
      tools: toSdkTools(sdk.ai, options.tools),
      toolChoice: "auto",
    });
    recordEvent("ai_generation_completed", {
      adapter: "vercel-ai-sdk", model, durationMs: Date.now() - startedAt,
      tokensUsed: result.usage?.totalTokens ?? 0, success: true,
    });
    return {
      content: result.text ?? "",
      tokensUsed: result.usage?.totalTokens ?? 0,
      model,
      toolCalls: normalizeToolCalls(result.toolCalls),
    };
  }

  if (options.stream && options.onChunk) {
    const stream = sdk.ai.streamText(base);
    let content = "";
    for await (const delta of stream.textStream) {
      content += delta;
      options.onChunk(delta); // plain text deltas — identical to the legacy contract
    }
    const usage = await stream.usage.catch(() => ({ totalTokens: 0 }));
    recordEvent("ai_generation_completed", {
      adapter: "vercel-ai-sdk", model, durationMs: Date.now() - startedAt,
      tokensUsed: usage.totalTokens ?? 0, success: true, streamed: true,
    });
    return { content, tokensUsed: usage.totalTokens ?? 0, model };
  }

  const result = await sdk.ai.generateText(base);
  recordEvent("ai_generation_completed", {
    adapter: "vercel-ai-sdk", model, durationMs: Date.now() - startedAt,
    tokensUsed: result.usage?.totalTokens ?? 0, success: true,
  });
  return { content: result.text ?? "", tokensUsed: result.usage?.totalTokens ?? 0, model };
}
