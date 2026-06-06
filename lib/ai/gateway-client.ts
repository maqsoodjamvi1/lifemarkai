/**
 * AI Gateway client — routes inference calls through the Cloudflare Worker
 * at ai.gateway.lifemarkai.app when LIFEMARK_GATEWAY_URL is set.
 *
 * When the env var is absent this module is a no-op and callers fall through
 * to the direct provider.ts path (local dev / self-hosted).
 *
 * Usage:
 *   const available = isGatewayAvailable();
 *   if (available) {
 *     return generateViaGateway(options, { projectId, userId });
 *   }
 *   return generateAI(options);   // fallback
 */

import type { GenerateOptions, GenerateResult, AIModel } from "./provider";

// ── Config ────────────────────────────────────────────────────────────────────

function getGatewayUrl(): string | null {
  return process.env.LIFEMARK_GATEWAY_URL ?? null;
}

function getGatewaySecret(): string | null {
  return process.env.LIFEMARK_GATEWAY_SECRET ?? null;
}

export function isGatewayAvailable(): boolean {
  return !!(getGatewayUrl() && getGatewaySecret());
}

// ── Context passed alongside each request ────────────────────────────────────

export interface GatewayContext {
  /** LifemarkAI project UUID — used for usage attribution */
  projectId?: string;
  /** Authenticated user UUID */
  userId?: string;
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

async function* parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data && data !== "[DONE]") yield data;
      }
    }
  }
}

// ── OpenAI-compatible response parsing ───────────────────────────────────────

interface OAIDelta { content?: string }
interface OAIChoice { delta?: OAIDelta; message?: { content?: string } }
interface OAIUsage { prompt_tokens?: number; completion_tokens?: number }
interface OAIChunk { choices?: OAIChoice[]; usage?: OAIUsage }

// ── Core generate function ────────────────────────────────────────────────────

export async function generateViaGateway(
  options: GenerateOptions,
  ctx: GatewayContext = {}
): Promise<GenerateResult> {
  const gatewayUrl = getGatewayUrl();
  const secret = getGatewaySecret();

  if (!gatewayUrl || !secret) {
    throw new Error("[gateway-client] Gateway not configured. Set LIFEMARK_GATEWAY_URL and LIFEMARK_GATEWAY_SECRET.");
  }

  const model: AIModel = options.model ?? (process.env.DEFAULT_AI_MODEL as AIModel) ?? "gpt-4o";

  // Build the OpenAI-compatible payload
  const payload: Record<string, unknown> = {
    model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 8000,
    temperature: options.temperature ?? 0.7,
    stream: options.stream ?? false,
  };

  if (options.jsonMode) {
    // OpenAI-compat providers honour this; Anthropic/Google ignores it gracefully
    payload.response_format = { type: "json_object" };
  }

  if (options.tools && options.tools.length > 0) {
    payload.tools = options.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    payload.tool_choice = "auto";
    payload.stream = false;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${secret}`,
  };

  if (ctx.projectId) headers["X-Lifemark-Project-Id"] = ctx.projectId;
  if (ctx.userId) headers["X-Lifemark-User-Id"] = ctx.userId;

  const endpoint = `${gatewayUrl.replace(/\/$/, "")}/v1/chat`;

  // ── Streaming ────────────────────────────────────────────────────────────
  if (options.stream && options.onChunk && !options.tools?.length) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, stream: true }),
    });

    if (!res.ok || !res.body) {
      const errText = await res.text();
      throw new Error(`[gateway-client] Upstream error ${res.status}: ${errText}`);
    }

    const reader = res.body.getReader();
    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const raw of parseSSE(reader)) {
      try {
        const chunk = JSON.parse(raw) as OAIChunk;
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          fullContent += delta;
          options.onChunk(delta);
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
          completionTokens = chunk.usage.completion_tokens ?? completionTokens;
        }
      } catch {
        // non-JSON line
      }
    }

    return { content: fullContent, tokensUsed: promptTokens + completionTokens, model };
  }

  // ── Non-streaming ────────────────────────────────────────────────────────
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[gateway-client] Upstream error ${res.status}: ${errText}`);
  }

  const data = await res.json() as OAIChunk & {
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  };

  const content = data.choices?.[0]?.message?.content ?? "";
  const tokensUsed =
    (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0);

  const toolCalls = data.choices?.[0]?.message
    ? (data as any).choices[0].message.tool_calls
    : undefined;

  return {
    content,
    tokensUsed,
    model,
    ...(toolCalls?.length
      ? {
          toolCalls: toolCalls.map((tc: any) => ({
            id: tc.id,
            name: tc.function.name,
            args: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
          })),
        }
      : {}),
  };
}

// ── Secret injection for Cloud projects ──────────────────────────────────────

export interface InjectSecretOptions {
  projectId: string;
  supabaseProjectRef: string;
  supabaseServiceRoleKey: string;
}

export async function injectGatewaySecret(opts: InjectSecretOptions): Promise<void> {
  const gatewayUrl = getGatewayUrl();
  const secret = getGatewaySecret();

  if (!gatewayUrl || !secret) {
    throw new Error("[gateway-client] Gateway not configured.");
  }

  const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/inject-secret`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${secret}`,
    },
    body: JSON.stringify({
      project_id: opts.projectId,
      supabase_project_ref: opts.supabaseProjectRef,
      supabase_service_role_key: opts.supabaseServiceRoleKey,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[gateway-client] inject-secret failed: ${err}`);
  }
}
