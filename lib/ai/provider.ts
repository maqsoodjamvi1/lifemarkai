import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getDefaultAiModel, useOpenRouterForAll, resolveOpenRouterModelId } from "./model-defaults";

export type AIModel =
  | "gpt-5.2"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "moonshotai/kimi-k2-instruct-0905"
  | "claude-opus-4-8"
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001"
  | "gemini-3.1-pro"
  | "gemini-3-flash-preview"
  | "gemini-3.1-flash-lite"
  | "gemini-2.0-flash"
  | "gemini-2.0-flash-lite"
  | "gemini-1.5-pro"
  // OpenRouter models
  | "meta-llama/llama-3.3-70b-instruct"
  | "meta-llama/llama-4-maverick"
  | "deepseek/deepseek-r1"
  | "deepseek/deepseek-chat-v3-0324"
  | "mistralai/mistral-large"
  | "mistralai/devstral-small"
  | "qwen/qwen3-235b-a22b"
  | "x-ai/grok-2-1212"
  | "google/gemma-3-27b-it";

export type AIProvider = "openai" | "openrouter" | "anthropic" | "google";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** A tool (function) the AI can call */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's parameters */
  parameters: Record<string, unknown>;
}

/** A tool invocation returned by the model */
export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments object */
  args: Record<string, unknown>;
}

export interface GenerateOptions {
  model?: AIModel;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  /**
   * When true, forces the model to output valid JSON.
   * - OpenAI: sets response_format = { type: "json_object" }
   * - Anthropic: injects an assistant prefill of "{" so the response starts with JSON
   *
   * The caller's system prompt MUST mention "JSON" or OpenAI will error.
   */
  jsonMode?: boolean;
  /**
   * Tool definitions for function calling.
   * When provided, the model may choose to call a tool instead of generating text.
   * Streaming is automatically disabled when tools are active.
   */
  tools?: ToolDefinition[];
}

export interface GenerateResult {
  content: string;
  tokensUsed: number;
  model: string;
  /** Populated when the model chose to invoke tool(s) instead of generating text */
  toolCalls?: ToolCall[];
}

/** Any model ID with a slash that isn't Groq — routes through OpenRouter */
function isOpenRouterModel(model: string): boolean {
  return model.includes("/") && !model.startsWith("moonshotai/");
}

function getProvider(model: AIModel): AIProvider {
  if (useOpenRouterForAll()) return "openrouter";
  if (model.startsWith("gpt-")) return "openai";
  // Prefer native Anthropic SDK (supports prompt caching) when key is present
  if (model.startsWith("claude-")) {
    return process.env.ANTHROPIC_API_KEY ? "anthropic" : "openrouter";
  }
  // Google Gemini — uses the OpenAI-compatible endpoint
  if (model.startsWith("gemini-")) return "google";
  // All other slash-separated model IDs (Llama, DeepSeek, Mistral, Qwen, Grok…) → OpenRouter
  if (isOpenRouterModel(model)) return "openrouter";
  return "openai";
}

/**
 * Map a native OpenAI / Anthropic / Google model ID to its OpenRouter slash form.
 * Returns null when the model isn't fallback-able via OpenRouter (e.g. an
 * already-slash OR model — nothing to remap).
 */
function toOpenRouterModel(model: AIModel): string | null {
  if (model.includes("/")) return null; // already an OpenRouter ID
  // OpenAI native → openai/* on OR
  if (model.startsWith("gpt-")) return `openai/${model}`;
  // Anthropic native → anthropic/* on OR
  if (model.startsWith("claude-")) return `anthropic/${model}`;
  // Google native → google/* on OR (OR uses gemini-* directly too, but we
  // prefix for clarity)
  if (model.startsWith("gemini-")) return `google/${model}`;
  return null;
}

/** Lifemark config uses `openrouter/gpt-4o-mini`; OpenRouter expects `openai/gpt-4o-mini`. */
function normalizeOpenRouterModel(model: string): string {
  if (!model.startsWith("openrouter/")) return model;
  const rest = model.slice("openrouter/".length);
  if (rest.includes("/")) return rest;
  if (rest.startsWith("gpt-")) return `openai/${rest}`;
  if (rest.startsWith("claude-")) return `anthropic/${rest}`;
  if (rest.startsWith("gemini-")) return `google/${rest}`;
  return rest;
}

/**
 * Identify errors that should trigger OpenRouter fallback. Quota (429),
 * billing (402), missing/invalid key (401), and a locally-absent provider key
 * (our own "Missing API key" throw) are the recoverable ones — anything else
 * is a request-shape bug that retrying via OR would just re-throw.
 */
function isFallbackableError(err: unknown): boolean {
  if (!err) return false;
  const status = (err as { status?: number; response?: { status?: number } }).status
    ?? (err as { response?: { status?: number } }).response?.status;
  if (status === 401 || status === 402 || status === 429) return true;
  const msg = (err as { message?: string }).message ?? "";
  return /quota|rate limit|insufficient_quota|exceeded|429|missing api key/i.test(msg);
}

/**
 * A known-good OpenRouter slug to fall back to when a configured/selected model
 * ID is rejected. Env-overridable. gpt-4o is broadly available and cheap.
 */
const OPENROUTER_SAFE_MODEL: string =
  process.env.OPENROUTER_SAFE_FALLBACK_MODEL || "openai/gpt-4o";

/**
 * True when OpenRouter rejected the request because the model slug itself is
 * bad (e.g. "xxx is not a valid model ID", a stale/renamed slug, or a bare
 * native id sent without a provider prefix). This is a request-shape bug, NOT a
 * quota/auth issue — so the right recovery is to retry with a different,
 * known-good model rather than the same one.
 */
function isInvalidModelError(err: unknown): boolean {
  const status = (err as { status?: number; response?: { status?: number } }).status
    ?? (err as { response?: { status?: number } }).response?.status;
  const msg = (err as { message?: string }).message ?? "";
  if (/not a valid model|no such model|model_not_found|invalid model|unknown model|is not a valid model id|no endpoints found/i.test(msg)) {
    return true;
  }
  // 400/404 that mention the model or endpoints is almost always a bad/retired slug.
  return (status === 400 || status === 404) && /\b(model|endpoints)\b/i.test(msg);
}

/**
 * Call OpenRouter, but if the slug is rejected as invalid, retry ONCE with a
 * known-good model so a stale or mistyped model ID degrades instead of
 * hard-failing a build/chat. (Reliability-at-scale: model slugs drift as
 * OpenRouter renames/retires them; a generation must never die on that.)
 */
async function generateOpenRouterSafe(
  options: GenerateOptions,
  model: string,
): Promise<GenerateResult> {
  try {
    return await generateOpenRouter({ ...options, model: model as AIModel });
  } catch (err) {
    if (isInvalidModelError(err) && model !== OPENROUTER_SAFE_MODEL) {
       
      console.warn(
        `[ai/provider] OpenRouter rejected "${model}" as an invalid model; ` +
          `retrying with ${OPENROUTER_SAFE_MODEL}.`,
      );
      return generateOpenRouter({ ...options, model: OPENROUTER_SAFE_MODEL as AIModel });
    }
    throw err;
  }
}

export async function generateAI(options: GenerateOptions): Promise<GenerateResult> {
  const model = options.model ?? getDefaultAiModel();

  // Clamp the requested output budget to what this model supports, so a 64K
  // request degrades safely (e.g. to 16K) if the slug falls back to gpt-4o.
  options = { ...options, maxTokens: clampMaxTokens(model, options.maxTokens) };

  if (useOpenRouterForAll()) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error(
        'OpenRouter is enabled (AI_VIA_OPENROUTER) but OPENROUTER_API_KEY is missing. Set it in .env.local.',
      );
    }
    const orModel = resolveOpenRouterModelId(model);
    return generateOpenRouterSafe(options, orModel);
  }

  const provider = getProvider(model);

  // Primary attempt — the model's native provider.
  try {
    if (provider === "anthropic") {
      return await generateAnthropic({ ...options, model });
    } else if (provider === "openrouter") {
      // A native id (e.g. claude-sonnet-4-6) routed here because its own
      // provider key is absent. OpenRouter needs the slash-prefixed slug
      // (anthropic/claude-sonnet-4-6) — sending the bare id 400s with
      // "not a valid model ID". Remap when there's no slash yet.
      const orModel = normalizeOpenRouterModel(
        model.includes("/") ? model : (toOpenRouterModel(model) ?? model),
      );
      return await generateOpenRouterSafe(options, orModel);
    } else if (provider === "google") {
      return await generateGoogle({ ...options, model });
    } else {
      return await generateOpenAI({ ...options, model });
    }
  } catch (err) {
    // Auto-fallback to OpenRouter when:
    //   • the failure was a quota/billing/auth error (not a request-shape bug)
    //   • OPENROUTER_API_KEY is set
    //   • we have an equivalent OpenRouter model ID
    //   • we weren't already on OpenRouter (no infinite loop)
    const orKey = process.env.OPENROUTER_API_KEY;
    const orModel = toOpenRouterModel(model);
    if (provider !== "openrouter" && orKey && orModel && isFallbackableError(err)) {
       
      console.warn(
        `[ai/provider] ${provider} returned ${(err as { status?: number }).status ?? "error"} for "${model}"; ` +
          `falling back to OpenRouter (${orModel}).`,
      );
      return generateOpenRouterSafe(options, orModel);
    }

    // Second-tier fallback: smart routing may pick a Gemini/GPT model on a
    // workspace that only has an Anthropic key (and no OpenRouter). Rather
    // than failing the request, degrade to the balanced Claude model.
    if (
      provider !== "anthropic" &&
      !model.startsWith("claude-") &&
      process.env.ANTHROPIC_API_KEY &&
      isFallbackableError(err)
    ) {
       
      console.warn(
        `[ai/provider] ${provider} unavailable for "${model}"; degrading to Claude (claude-sonnet-4-6).`,
      );
      return generateAnthropic({ ...options, model: "claude-sonnet-4-6" });
    }
    throw err;
  }
}

function isGroqModel(model: AIModel) {
  return model.startsWith("moonshotai/");
}

function createOpenAIClient(model: AIModel) {
  const isGroq = isGroqModel(model);
  const forceOR = useOpenRouterForAll();
  // OpenRouter: forced for all models, explicit OR model IDs, or Claude fallback when no Anthropic key
  const isOR =
    forceOR ||
    isOpenRouterModel(model) ||
    (model.startsWith("claude-") && !process.env.ANTHROPIC_API_KEY);
  const isGoogle = !forceOR && model.startsWith("gemini-");

  const apiKey = forceOR
    ? process.env.OPENROUTER_API_KEY
    : isGoogle
    ? process.env.GOOGLE_GENERATIVE_AI_API_KEY
    : isOR
    ? process.env.OPENROUTER_API_KEY
    : isGroq
    ? process.env.GROQ_API_KEY
    : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const providerName = forceOR || isOR ? "OpenRouter" : isGoogle ? "Google AI" : isGroq ? "Groq/Kimi" : "OpenAI";
    const envVar =
      forceOR || isOR ? "OPENROUTER_API_KEY" : isGoogle ? "GOOGLE_GENERATIVE_AI_API_KEY" : isGroq ? "GROQ_API_KEY" : "OPENAI_API_KEY";
    throw new Error(`Missing API key for ${providerName} model "${model}". Set ${envVar} in your environment.`);
  }

  return new OpenAI({
    apiKey,
    ...(forceOR || isOR
      ? {
          baseURL: "https://openrouter.ai/api/v1",
          defaultHeaders: {
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.com",
            "X-Title": "LifemarkAI",
          },
        }
      : isGoogle
      ? { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" }
      : isGroq
      ? { baseURL: process.env.GROQ_API_BASE_URL ?? "https://api.groq.com/openai/v1" }
      : {}),
  });
}

/** GPT-5-family models reject `max_tokens` on chat completions — they take `max_completion_tokens`. */
function openAiTokenArg(model: string, n: number): Record<string, number> {
  return model.startsWith("gpt-5") ? { max_completion_tokens: n } : { max_tokens: n };
}

/**
 * Maximum output tokens a model can return. Requesting more than the model
 * supports makes some providers (OpenAI) hard-error, so we clamp the requested
 * value down to the model's ceiling. Lets us ask for 64K on Claude/Gemini for
 * complete-app builds while staying safe when the slug falls back to gpt-4o.
 */
function maxOutputFor(model: string): number {
  const m = model.toLowerCase();
  if (m.includes("claude")) return 64000; // Claude Opus/Sonnet 4.x: 64K output
  if (m.includes("gpt-5")) return 64000;
  if (m.includes("gemini")) return 64000; // Gemini 3.x flash/pro: 64K output
  if (m.includes("gpt-4o")) return 16384; // 4o / 4o-mini cap
  if (m.includes("deepseek")) return 32000;
  return 16384; // conservative default for unknown / open-weight models
}

/** Clamp a requested output-token count to what the model actually supports. */
export function clampMaxTokens(model: string, requested?: number): number | undefined {
  if (requested == null) return requested;
  return Math.min(requested, maxOutputFor(model));
}

async function generateOpenAI(options: GenerateOptions & { model: AIModel }): Promise<GenerateResult> {
  const openai = createOpenAIClient(options.model);

  // ── Tool calling path (non-streaming) ───────────────────────────────────
  if (options.tools && options.tools.length > 0) {
    const oaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = options.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await openai.chat.completions.create({
      model: options.model,
      messages: options.messages,
      ...openAiTokenArg(options.model, options.maxTokens ?? 4000),
      temperature: options.temperature ?? 0.3,
      tools: oaiTools,
      tool_choice: "auto",
    });

    const msg = response.choices[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: (() => {
        try { return JSON.parse(tc.function.arguments) as Record<string, unknown>; }
        catch { return {}; }
      })(),
    }));

    return {
      content: msg?.content ?? "",
      tokensUsed: response.usage?.total_tokens ?? 0,
      model: options.model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  // ── Streaming path ───────────────────────────────────────────────────────
  if (options.stream && options.onChunk) {
    const stream = await openai.chat.completions.create({
      model: options.model,
      messages: options.messages,
      ...openAiTokenArg(options.model, options.maxTokens ?? 8000),
      temperature: options.temperature ?? 0.7,
      stream: true,
      ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    });

    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullContent += delta;
        options.onChunk(delta);
      }
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }
    }

    return {
      content: fullContent,
      tokensUsed: promptTokens + completionTokens,
      model: options.model,
    };
  }

  const response = await openai.chat.completions.create({
    model: options.model,
    messages: options.messages,
    ...openAiTokenArg(options.model, options.maxTokens ?? 8000),
    temperature: options.temperature ?? 0.7,
    ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });

  return {
    content: response.choices[0]?.message?.content ?? "",
    tokensUsed: response.usage?.total_tokens ?? 0,
    model: options.model,
  };
}

async function generateOpenRouter(options: GenerateOptions & { model: AIModel }): Promise<GenerateResult> {
  const model = normalizeOpenRouterModel(options.model) as AIModel;
  const openrouter = createOpenAIClient(model);

  if (options.tools && options.tools.length > 0) {
    const oaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = options.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await openrouter.chat.completions.create({
      model,
      messages: options.messages,
      ...openAiTokenArg(options.model, options.maxTokens ?? 4000),
      temperature: options.temperature ?? 0.3,
      tools: oaiTools,
      tool_choice: "auto",
    });

    const msg = response.choices[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: (() => {
        try { return JSON.parse(tc.function.arguments) as Record<string, unknown>; }
        catch { return {}; }
      })(),
    }));

    return {
      content: msg?.content ?? "",
      tokensUsed: response.usage?.total_tokens ?? 0,
      model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  if (options.stream && options.onChunk) {
    const stream = await openrouter.chat.completions.create({
      model: model,
      messages: options.messages,
      ...openAiTokenArg(options.model, options.maxTokens ?? 8000),
      temperature: options.temperature ?? 0.7,
      stream: true,
      // OpenRouter forwards response_format to the underlying provider.
      // Models that don't support json_object (some open-weight models)
      // silently ignore the flag — no downside to always sending it in
      // build mode where the chat route explicitly requested JSON.
      ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    });

    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullContent += delta;
        options.onChunk(delta);
      }
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }
    }

    return {
      content: fullContent,
      tokensUsed: promptTokens + completionTokens,
      model: model,
    };
  }

  const response = await openrouter.chat.completions.create({
    model: model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 8000,
    temperature: options.temperature ?? 0.7,
    ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });

  return {
    content: response.choices[0]?.message?.content ?? "",
    tokensUsed: response.usage?.total_tokens ?? 0,
    model: model,
  };
}

// ── Google Gemini — uses Google's OpenAI-compatible endpoint ─────────────────
// No extra package needed: we reuse the OpenAI SDK pointed at Google's REST API.
// Docs: https://ai.google.dev/gemini-api/docs/openai

async function generateGoogle(options: GenerateOptions & { model: AIModel }): Promise<GenerateResult> {
  const client = createOpenAIClient(options.model);

  // Gemini doesn't support response_format json_object in the compat layer yet
  // — fall back to plain text when jsonMode is set and rely on the system prompt
  const jsonNote = options.jsonMode
    ? [{ role: "system" as const, content: "Respond ONLY with valid JSON. No markdown, no explanation." }]
    : [];
  const msgs = [...jsonNote, ...options.messages];

  if (options.stream && options.onChunk) {
    const stream = await client.chat.completions.create({
      model: options.model,
      messages: msgs,
      max_tokens: options.maxTokens ?? 8192,
      temperature: options.temperature ?? 0.7,
      stream: true,
    });

    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullContent += delta;
        options.onChunk(delta);
      }
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }
    }

    return { content: fullContent, tokensUsed: promptTokens + completionTokens, model: options.model };
  }

  const response = await client.chat.completions.create({
    model: options.model,
    messages: msgs,
    max_tokens: options.maxTokens ?? 8192,
    temperature: options.temperature ?? 0.7,
  });

  return {
    content: response.choices[0]?.message?.content ?? "",
    tokensUsed: response.usage?.total_tokens ?? 0,
    model: options.model,
  };
}

// ── Native Anthropic SDK — supports prompt caching ──────────────────────────

const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

/**
 * Map our AIMessage array to Anthropic's format.
 * - system messages are extracted and returned as the `system` param (with cache_control)
 * - history messages are mapped; the final message before the new user turn gets cache_control
 *   so the entire conversation prefix is cached on repeated calls to the same project
 */
function buildAnthropicMessages(messages: AIMessage[]): {
  system: Anthropic.TextBlockParam[];
  msgs: Anthropic.MessageParam[];
} {
  // Extract system messages into the dedicated `system` param
  const systemParts = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  // Build system blocks — add cache_control to the last system block so the
  // entire (often large) system prompt is cached across requests.
  // Note: cache_control was added in @anthropic-ai/sdk ^0.26; we cast via `as any`
  // so the code compiles against older installed types until `npm install` is run.
  const systemBlocks: Anthropic.TextBlockParam[] = systemParts.map((m, i) => {
    const block = { type: "text" as const, text: m.content } as any;
    if (i === systemParts.length - 1) block.cache_control = { type: "ephemeral" };
    return block as Anthropic.TextBlockParam;
  });

  // Build conversation messages — add cache_control to the second-to-last
  // message (the last history entry before the new user prompt) so the
  // conversation history prefix is cached.
  const msgs: Anthropic.MessageParam[] = nonSystem.map((m, i) => {
    const isHistoryBoundary = i === nonSystem.length - 2; // penultimate = last history msg
    const textBlock = { type: "text" as const, text: m.content } as any;
    if (isHistoryBoundary) textBlock.cache_control = { type: "ephemeral" };
    const content: Anthropic.ContentBlockParam[] = [textBlock as Anthropic.TextBlockParam];
    return { role: m.role as "user" | "assistant", content };
  });

  return { system: systemBlocks, msgs };
}

async function generateAnthropic(options: GenerateOptions & { model: AIModel }): Promise<GenerateResult> {
  const { system, msgs } = buildAnthropicMessages(options.messages);

  // ── Tool calling path (non-streaming) ───────────────────────────────────
  if (options.tools && options.tools.length > 0) {
    const anthropicTools: Anthropic.Tool[] = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool["input_schema"],
    }));

    const response = await anthropicClient.messages.create({
      model: options.model,
      system: system.length > 0 ? system : undefined,
      messages: msgs,
      max_tokens: options.maxTokens ?? 4000,
      temperature: options.temperature ?? 0.3,
      tools: anthropicTools,
      tool_choice: { type: "auto" as const },
    } as Parameters<typeof anthropicClient.messages.create>[0]) as Anthropic.Message;

    const toolCalls: ToolCall[] = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({
        id: b.id,
        name: b.name,
        args: b.input as Record<string, unknown>,
      }));

    const textContent = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      content: textContent,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: options.model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  // jsonMode: Anthropic doesn't have a response_format param — we rely on the
  // system prompt already containing JSON instructions + the caller's prefill
  // The assistant prefill trick is handled via a trailing assistant message if needed
  const extraMessages: Anthropic.MessageParam[] = options.jsonMode
    ? [{ role: "assistant", content: [{ type: "text", text: "{" }] }]
    : [];

  const allMsgs = [...msgs, ...extraMessages];

  if (options.stream && options.onChunk) {
    const stream = await anthropicClient.messages.stream({
      model: options.model,
      system: system.length > 0 ? system : undefined,
      messages: allMsgs,
      max_tokens: options.maxTokens ?? 8000,
      temperature: options.temperature ?? 0.7,
    } as Parameters<typeof anthropicClient.messages.stream>[0]);

    let fullContent = options.jsonMode ? "{" : "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const chunk = event.delta.text;
        fullContent += chunk;
        options.onChunk(chunk);
      }
      if (event.type === "message_delta" && event.usage) {
        outputTokens = event.usage.output_tokens;
      }
      if (event.type === "message_start" && event.message.usage) {
        inputTokens = event.message.usage.input_tokens;
      }
    }


    return { content: fullContent, tokensUsed: inputTokens + outputTokens, model: options.model };
  }

  const response = await anthropicClient.messages.create({
    model: options.model,
    system: system.length > 0 ? system : undefined,
    messages: allMsgs,
    max_tokens: options.maxTokens ?? 8000,
    temperature: options.temperature ?? 0.7,
  } as Parameters<typeof anthropicClient.messages.create>[0]) as Anthropic.Message;

  const textContent = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const content = options.jsonMode ? "{" + textContent : textContent;
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  return { content, tokensUsed, model: options.model };
}
