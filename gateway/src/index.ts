/**
 * LifemarkAI — AI Gateway Worker
 * https://ai.gateway.lifemarkai.app
 *
 * Acts as a thin authenticated proxy in front of OpenAI / Anthropic /
 * OpenRouter / Google AI. Responsibilities:
 *
 *   1. Verify the caller's LIFEMARK_API_KEY (shared secret or per-project JWT).
 *   2. Route the request to the correct upstream provider based on the model.
 *   3. Forward the response — streaming (SSE) or JSON — back to the caller.
 *   4. Log usage (prompt + completion tokens → ai_cents) to
 *      lifemark_cloud_usage in Supabase after the response is flushed.
 *   5. Inject LIFEMARK_API_KEY into generated Cloud project edge functions
 *      via a dedicated /inject-secret endpoint.
 *
 * Cost model (approximate — adjust TOKEN_COST_MAP as pricing changes):
 *   ai_cents = ceil((prompt_tokens × input_rate + completion_tokens × output_rate) × 100)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Env {
  // Upstream AI provider keys
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  OPENROUTER_API_KEY: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;

  // Supabase (service-role — needed to write usage records)
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // Supabase Management API personal/access token (api.supabase.com).
  // NOT the project service-role key — the Management API rejects that.
  SUPABASE_MGMT_TOKEN: string;

  // Shared secret between this Worker and the Next.js app
  GATEWAY_SECRET: string;

  // Injected by wrangler.toml [vars]
  ENVIRONMENT: string;
  APP_URL: string;
  /** When not "false", route all models through OpenRouter when OPENROUTER_API_KEY is set. */
  AI_VIA_OPENROUTER?: string;

  // ── Phase 5 (Vercel adoption plan): Vercel AI Gateway as an alternative upstream ──
  /** API key for https://ai-gateway.vercel.sh; absence disables the upstream entirely. */
  VERCEL_AI_GATEWAY_API_KEY?: string;
  /** "true" routes ALL slash-model traffic to Vercel AI Gateway (kill switch: "false"/unset). */
  VERCEL_AI_GATEWAY_ENABLED?: string;
  /** 0..100 — deterministic per-user A/B split to Vercel AI Gateway. Ignored when ENABLED is "true"/"false". */
  VERCEL_AI_GATEWAY_PERCENT?: string;
}

type AIProvider = "openai" | "anthropic" | "openrouter" | "google" | "vercel-gateway";

interface RouteInfo {
  provider: AIProvider;
  upstreamUrl: string;
  apiKey: string;
}

interface UsagePayload {
  projectId: string;
  userId: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

// ── Token cost table (USD per 1M tokens, as of 2025-05) ──────────────────────
// Values are [input_per_1M_usd, output_per_1M_usd]
const TOKEN_COST_MAP: Record<string, [number, number]> = {
  // OpenAI
  "gpt-5.2":                  [1.75,  14.00],
  "openai/gpt-5.2":           [1.75,  14.00],
  "openai/gpt-5.2-codex":     [1.75,  14.00],
  "openai/gpt-5.5":           [5.00,  30.00],
  // Anthropic — native API IDs use hyphens, OpenRouter slugs use DOTS.
  // Tiers route via OpenRouter (dot slugs); native keys kept for direct calls.
  "claude-opus-4-8":            [5.00,  25.00],
  "anthropic/claude-opus-4.8":  [5.00,  25.00],
  "claude-opus-4-6":            [15.00, 75.00],
  "claude-sonnet-4-6":          [3.00,  15.00],
  "anthropic/claude-sonnet-4.6":[3.00,  15.00],
  "claude-haiku-4-5-20251001":  [0.80,   4.00],
  "claude-haiku-4-5":           [0.80,   4.00],
  "anthropic/claude-haiku-4.5": [0.80,   4.00],
  // Google
  "gemini-3.1-pro":      [2.00,  12.00],
  "google/gemini-3.5-flash":[0.50, 3.00],
  "google/gemini-3.1-flash-lite":[0.25, 1.50],
  "gemini-3-flash-preview":[0.50,  3.00],
  "gemini-3.1-flash-lite":[0.25,   1.50],
  "gemini-3.1-flash-image":[0.50,  3.00], // image output billed per-image upstream
  "gemini-2.0-flash":    [0.10,   0.40],
  "gemini-2.0-flash-lite":[0.075, 0.30],
  "gemini-1.5-pro":      [1.25,   5.00],
  // OpenRouter models — rough estimates
  "deepseek/deepseek-v4-pro":             [0.55, 2.19],
  "deepseek/deepseek-v4-flash":           [0.10, 0.40],
  "qwen/qwen3-coder":                     [0.20, 0.80],
  "qwen/qwen3-coder:free":                [0.00, 0.00],
  "meta-llama/llama-3.3-70b-instruct:free": [0.00, 0.00],
  "mistralai/devstral-2512":            [0.10, 0.30],
  "z-ai/glm-5-turbo":                   [0.20, 0.80],
  "moonshotai/kimi-k2.7-code":          [0.60, 2.50],
  // Embeddings (input-only; output rate 0) — for semantic search / RAG in
  // generated apps via POST /v1/embeddings.
  "text-embedding-3-small":  [0.02, 0.00],
  "text-embedding-3-large":  [0.13, 0.00],
  "text-embedding-ada-002":  [0.10, 0.00],
  "gemini-embedding-001":    [0.15, 0.00],
  "google/gemini-embedding-001": [0.15, 0.00],
};

// Fallback cost when model is unknown
const DEFAULT_COST: [number, number] = [1.00, 5.00];

function computeAiCents(model: string, promptTokens: number, completionTokens: number): number {
  const [inputRate, outputRate] = TOKEN_COST_MAP[model] ?? DEFAULT_COST;
  const usd = (promptTokens * inputRate + completionTokens * outputRate) / 1_000_000;
  return Math.ceil(usd * 100);
}

// ── Provider routing ──────────────────────────────────────────────────────────

function shouldUseOpenRouter(env: Env): boolean {
  const flag = env.AI_VIA_OPENROUTER?.toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return !!env.OPENROUTER_API_KEY;
}

// ── Phase 5: OpenRouter vs Vercel AI Gateway upstream selection ──────────────
//
// Both upstreams are OpenAI-compatible and serve the SAME slash-model ids, so
// switching upstream never changes the model — the A/B compares gateways, not
// model families (the plan's fairness requirement). Everything this Worker
// owns (auth, attribution, cost calculation, credit deduction, usage
// persistence, allowlists) is upstream-agnostic and runs unchanged.
//
// Selection order:
//   VERCEL_AI_GATEWAY_ENABLED="false" → OpenRouter, always (the one-env rollback)
//   VERCEL_AI_GATEWAY_ENABLED="true"  → Vercel AI Gateway, always
//   VERCEL_AI_GATEWAY_PERCENT=N      → N% of users, hashed on user id — the
//     same user always gets the same upstream, so one build never straddles two
//   otherwise                         → OpenRouter (default; also the fallback
//     when no VERCEL_AI_GATEWAY_API_KEY is configured)

function abBucket(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

function shouldUseVercelGateway(env: Env, userId: string): boolean {
  if (!env.VERCEL_AI_GATEWAY_API_KEY) return false;
  const flag = env.VERCEL_AI_GATEWAY_ENABLED?.toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  const percent = Math.min(100, Math.max(0, parseInt(env.VERCEL_AI_GATEWAY_PERCENT ?? "0", 10) || 0));
  if (percent <= 0) return false;
  // No user identity → stay on the default upstream rather than coin-flipping.
  if (!userId) return false;
  return abBucket(`vercel-gateway:${userId}`) < percent;
}

function vercelGatewayRoute(env: Env): RouteInfo {
  return {
    provider: "vercel-gateway",
    upstreamUrl: "https://ai-gateway.vercel.sh/v1/chat/completions",
    apiKey: env.VERCEL_AI_GATEWAY_API_KEY!,
  };
}

function resolveRoute(model: string, env: Env, userId = ""): RouteInfo {
  // Phase 5: only slash models (the OpenRouter population) participate in the
  // A/B — native gpt-/claude-/gemini- routing below is untouched.
  if (model.includes("/") && shouldUseVercelGateway(env, userId)) {
    return vercelGatewayRoute(env);
  }
  if (shouldUseOpenRouter(env)) {
    if (!env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is required when AI_VIA_OPENROUTER is enabled");
    }
    return {
      provider: "openrouter",
      upstreamUrl: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: env.OPENROUTER_API_KEY,
    };
  }
  if (model.startsWith("gpt-")) {
    return {
      provider: "openai",
      upstreamUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: env.OPENAI_API_KEY,
    };
  }
  if (model.startsWith("claude-")) {
    return {
      provider: "anthropic",
      upstreamUrl: "https://api.anthropic.com/v1/messages",
      apiKey: env.ANTHROPIC_API_KEY,
    };
  }
  if (model.startsWith("gemini-")) {
    return {
      provider: "google",
      upstreamUrl: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    };
  }
  // Everything else (Llama, DeepSeek, Mistral, Qwen, Kimi, etc.) → OpenRouter
  return {
    provider: "openrouter",
    upstreamUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: env.OPENROUTER_API_KEY,
  };
}

/**
 * Map a native OpenAI / Anthropic / Google model ID to its OpenRouter slash
 * form so we can retry there when the primary provider is rate-limited / out of
 * quota. Returns null for models that are already OpenRouter IDs (have a slash).
 */
const CLAUDE_OPENROUTER_SLUGS: Record<string, string> = {
  "claude-opus-4-8": "anthropic/claude-opus-4.8",
  "claude-opus-4-6": "anthropic/claude-opus-4.6",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
  "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
  "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
};

function resolveOpenRouterModelId(model: string): string {
  if (model.startsWith("openrouter/")) {
    const rest = model.slice("openrouter/".length);
    const claudeRest = rest.startsWith("anthropic/") ? rest.slice("anthropic/".length) : rest;
    const claude = CLAUDE_OPENROUTER_SLUGS[claudeRest];
    if (claude) return claude;
    if (rest.startsWith("gpt-")) return `openai/${rest}`;
    if (rest.startsWith("claude-")) return `anthropic/${rest}`;
    if (rest.startsWith("gemini-")) return `google/${rest}`;
    if (rest.includes("/")) return rest;
    return model;
  }
  const bare = model;
  const claudeBare = bare.startsWith("anthropic/") ? bare.slice("anthropic/".length) : bare;
  const claude = CLAUDE_OPENROUTER_SLUGS[claudeBare];
  if (claude) return claude;
  if (bare.includes("/")) return bare;
  if (bare.startsWith("gpt-")) return `openai/${bare}`;
  if (bare.startsWith("claude-")) return `anthropic/${bare}`;
  if (bare.startsWith("gemini-")) return `google/${bare}`;
  return bare;
}

function toOpenRouterModel(model: string): string | null {
  const resolved = resolveOpenRouterModelId(model);
  if (resolved !== model) return resolved;
  if (model.includes("/")) return null; // already an OpenRouter ID
  return null;
}

/** Quota (429) / billing (402) / auth (401) are the recoverable upstream errors. */
function isFallbackableStatus(status: number): boolean {
  return status === 401 || status === 402 || status === 429;
}

/**
 * Dispatch the upstream request, retrying once via OpenRouter when the native
 * provider returns a recoverable error. Mirrors the auto-fallback that the
 * direct (non-gateway) provider path already has — without this, routing
 * through the gateway *loses* that resilience.
 */
async function dispatchWithFallback(
  body: Record<string, unknown>,
  route: RouteInfo,
  model: string,
  env: Env,
  isStreaming: boolean
): Promise<{ res: Response; usedModel: string; usedProvider: AIProvider }> {
  // Generous ceiling for streamed generations (avoids truncating long outputs);
  // tighter for non-streaming where a slow upstream just blocks the caller.
  const timeoutMs = isStreaming ? 300_000 : 60_000;
  const doFetch = (req: Request) => fetch(req, { signal: AbortSignal.timeout(timeoutMs) });

  const res = await doFetch(buildUpstreamRequest(body, route, env.APP_URL));

  if (res.ok || route.provider === "openrouter" || !isFallbackableStatus(res.status)) {
    return { res, usedModel: model, usedProvider: route.provider };
  }

  // Phase 5: Vercel AI Gateway keeps OpenRouter as the EMERGENCY upstream.
  // Slash models are already OpenRouter ids, so retry with the same model —
  // toOpenRouterModel() below would return null for them and skip the retry.
  if (route.provider === "vercel-gateway" && env.OPENROUTER_API_KEY) {
    await res.text().catch(() => {});
    const emergencyRoute: RouteInfo = {
      provider: "openrouter",
      upstreamUrl: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: env.OPENROUTER_API_KEY,
    };
    const emergencyRes = await doFetch(
      buildUpstreamRequest(body, emergencyRoute, env.APP_URL)
    );
    return { res: emergencyRes, usedModel: model, usedProvider: "openrouter" };
  }

  const orModel = toOpenRouterModel(model);
  if (!orModel || !env.OPENROUTER_API_KEY) {
    return { res, usedModel: model, usedProvider: route.provider };
  }

  // Drain the failed response so the connection can be reused, then retry on OR.
  await res.text().catch(() => {});
  const orRoute: RouteInfo = {
    provider: "openrouter",
    upstreamUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: env.OPENROUTER_API_KEY,
  };
  const orRes = await doFetch(
    buildUpstreamRequest({ ...body, model: orModel }, orRoute, env.APP_URL)
  );
  return { res: orRes, usedModel: orModel, usedProvider: "openrouter" };
}

// ── Balance enforcement ───────────────────────────────────────────────────────
// Unified billing (migration 074): AI usage debits the single credit balance
// (profiles.credits) at 4 cents/credit. debit_ai_balance clamps at -2500
// credits (= -10000 cents); once a workspace hits that floor we stop
// dispatching new inference instead of letting it run unbounded.
const AI_BALANCE_FLOOR_CENTS = -10000;
/** 1 credit = 4 cents — must match migration 074 and lib/credits.ts. */
const CENTS_PER_CREDIT = 4;

/** Read the workspace credit balance as cents-equivalent (credits × 4). Returns null if unknown. */
async function checkAiBalance(userId: string, env: Env): Promise<number | null> {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=credits`,
      {
        headers: {
          "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ credits?: number | string }>;
    const credits = rows[0]?.credits;
    if (credits === undefined || credits === null) return null;
    const n = typeof credits === "string" ? parseFloat(credits) : credits;
    if (!Number.isFinite(n)) return null;
    return Math.round(n * CENTS_PER_CREDIT);
  } catch {
    return null; // fail-open: never block inference on a balance-lookup error
  }
}

// ── Upstream request builders ─────────────────────────────────────────────────

function buildUpstreamRequest(
  body: Record<string, unknown>,
  route: RouteInfo,
  appUrl: string
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (route.provider === "anthropic") {
    headers["x-api-key"] = route.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-beta"] = "prompt-caching-2024-07-31";
  } else {
    headers["Authorization"] = `Bearer ${route.apiKey}`;
  }

  if (route.provider === "openrouter") {
    headers["HTTP-Referer"] = appUrl;
    headers["X-Title"] = "LifemarkAI";
  }

  return new Request(route.upstreamUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ── CORS helpers ──────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  "https://lifemarkai.app",
  "https://www.lifemarkai.app",
  "https://lifemarkai.com",
  "https://www.lifemarkai.com",
  "http://localhost:3000",
  "http://localhost:3001",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://lifemarkai.app";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lifemark-Project-Id, X-Lifemark-User-Id",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function preflight(origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Constant-time string comparison to avoid leaking the secret via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function authenticate(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  return safeEqual(token, env.GATEWAY_SECRET);
}

// ── Usage logging ─────────────────────────────────────────────────────────────

async function logUsage(usage: UsagePayload, env: Env): Promise<void> {
  const aiCents = computeAiCents(usage.model, usage.promptTokens, usage.completionTokens);
  return logUsageCents(aiCents, usage.projectId, usage.userId, env);
}

/** Insert a usage row + debit the unified credit balance by raw cents.
 *  Used by token-billed chat (via logUsage) and duration/character-billed
 *  audio endpoints. */
async function logUsageCents(aiCents: number, projectId: string, userId: string, env: Env): Promise<void> {
  if (aiCents === 0) return;
  const usage = { projectId, userId };

  try {
    // Insert a usage record
    const insertRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/lifemark_cloud_usage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          project_id: usage.projectId,
          user_id: usage.userId,
          ai_cents: aiCents,
        }),
      }
    );
    if (!insertRes.ok) {
      console.error("[gateway] usage insert failed:", await insertRes.text());
    }

    // Debit the unified credit balance (4¢/credit — migration 074)
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/debit_ai_balance`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ p_user_id: usage.userId, p_cents: aiCents }),
      }
    );
  } catch (err) {
    // Non-critical — never let logging break the response
    console.error("[gateway] logUsage error:", err);
  }
}

// ── Token extraction from streamed responses ──────────────────────────────────

/**
 * Transform stream: pass chunks to the client while accumulating token usage.
 * Works for both OpenAI-compatible SSE (`data: {...}`) and Anthropic events.
 * Returns a ReadableStream that mirrors the upstream plus a Promise that
 * resolves once the stream ends with { promptTokens, completionTokens }.
 */
function createPassthroughStream(
  upstream: ReadableStream<Uint8Array>,
  provider: AIProvider
): { stream: ReadableStream<Uint8Array>; usage: Promise<{ promptTokens: number; completionTokens: number }> } {
  let promptTokens = 0;
  let completionTokens = 0;
  let resolveUsage!: (v: { promptTokens: number; completionTokens: number }) => void;
  const usagePromise = new Promise<{ promptTokens: number; completionTokens: number }>(
    (res) => { resolveUsage = res; }
  );

  const decoder = new TextDecoder();
  const reader = upstream.getReader();

  // SSE events are newline-delimited but a single `value` read can split a line
  // (including the `usage` line) across chunk boundaries. Buffer the trailing
  // partial line between reads so we never miss the usage record.
  let sseBuffer = "";

  const parseLine = (line: string): void => {
    if (!line.startsWith("data: ")) return;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]" || !raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (provider === "anthropic") {
        const type = parsed.type as string | undefined;
        if (type === "message_start") {
          const usage = (parsed as any).message?.usage;
          if (usage) promptTokens = usage.input_tokens ?? 0;
        }
        if (type === "message_delta") {
          const usage = (parsed as any).usage;
          if (usage) completionTokens = usage.output_tokens ?? 0;
        }
      } else {
        // OpenAI-compatible (including Google / OpenRouter)
        const usage = (parsed as any).usage;
        if (usage) {
          promptTokens = usage.prompt_tokens ?? promptTokens;
          completionTokens = usage.completion_tokens ?? completionTokens;
        }
      }
    } catch {
      // Non-JSON line — ignore
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          // Flush any buffered final line before resolving usage.
          if (sseBuffer) parseLine(sseBuffer);
          resolveUsage({ promptTokens, completionTokens });
          controller.close();
          return;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        // Keep the last (possibly incomplete) segment buffered for the next read.
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) parseLine(line);

        // Forward the original bytes to the client untouched.
        controller.enqueue(value);
      } catch (err) {
        resolveUsage({ promptTokens, completionTokens });
        controller.error(err);
      }
    },
    cancel() {
      resolveUsage({ promptTokens, completionTokens });
      reader.cancel();
    },
  });

  return { stream, usage: usagePromise };
}

// ── /v1/chat — main proxy endpoint ───────────────────────────────────────────

async function handleChat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get("Origin");

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  const model = (body.model as string | undefined) ?? "qwen/qwen3-coder";
  const isStreaming = body.stream === true;
  const projectId = request.headers.get("X-Lifemark-Project-Id") ?? "";
  const userId = request.headers.get("X-Lifemark-User-Id") ?? "";

  if (shouldUseOpenRouter(env)) {
    const orModel = resolveOpenRouterModelId(model);
    if (orModel !== model) body = { ...body, model: orModel };
  }

  let route: RouteInfo;
  try {
    route = resolveRoute(model, env, userId);
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  // ── Enforce the AI spend ceiling before dispatching (Cloud-attributed only) ─
  // Without this, credits are only debited *after* the response, so a workspace
  // could run unbounded inference while already past its balance floor.
  if (projectId && userId) {
    const balance = await checkAiBalance(userId, env);
    if (balance !== null && balance <= AI_BALANCE_FLOOR_CENTS) {
      return new Response(
        JSON.stringify({ error: "Credit balance exhausted. Top up your LifemarkAI credits to continue." }),
        { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }
  }

  // ── Force usage accounting on streamed responses ────────────────────────────
  // OpenAI-compatible providers (OpenAI / OpenRouter / Google) only emit a
  // `usage` block mid-stream when stream_options.include_usage is set. Without
  // this, streamed requests bill $0. Anthropic streams usage natively.
  if (isStreaming && route.provider !== "anthropic") {
    const existing = (body.stream_options as Record<string, unknown> | undefined) ?? {};
    body.stream_options = { ...existing, include_usage: true };
  }

  let upstreamRes: Response;
  let billedModel = model;
  let streamProvider = route.provider;
  try {
    const dispatched = await dispatchWithFallback(body, route, model, env, isStreaming);
    upstreamRes = dispatched.res;
    billedModel = dispatched.usedModel;
    streamProvider = dispatched.usedProvider;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Upstream unreachable", detail: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  if (!upstreamRes.ok) {
    // Surface the upstream error verbatim
    const errBody = await upstreamRes.text();
    return new Response(errBody, {
      status: upstreamRes.status,
      headers: {
        "Content-Type": upstreamRes.headers.get("Content-Type") ?? "application/json",
        ...corsHeaders(origin),
      },
    });
  }

  // ── Streaming response ───────────────────────────────────────────────────
  if (isStreaming && upstreamRes.body) {
    const { stream, usage } = createPassthroughStream(upstreamRes.body, streamProvider);

    // Log usage after the stream drains — fire-and-forget via waitUntil
    if (projectId && userId) {
      ctx.waitUntil(
        usage.then(({ promptTokens, completionTokens }) =>
          logUsage({ projectId, userId, promptTokens, completionTokens, model: billedModel }, env)
        )
      );
    }

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        // Phase 5: tell the app which upstream actually served this request so
        // eval rows can compare OpenRouter vs Vercel AI Gateway per response.
        "X-Lifemark-Upstream": streamProvider,
        ...corsHeaders(origin),
      },
    });
  }

  // ── Non-streaming response ───────────────────────────────────────────────
  const responseBody = await upstreamRes.json() as Record<string, unknown>;

  if (projectId && userId) {
    let promptTokens = 0;
    let completionTokens = 0;
    const usage = (responseBody as any).usage;
    if (usage) {
      // OpenAI-compat
      promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
      completionTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
    }
    ctx.waitUntil(
      logUsage({ projectId, userId, promptTokens, completionTokens, model: billedModel }, env)
    );
  }

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Lifemark-Upstream": streamProvider,
      ...corsHeaders(origin),
    },
  });
}

// ── /inject-secret — push LIFEMARK_API_KEY into a Cloud project ──────────────
// Called by the Next.js provisioning flow when a project is enabled for Cloud.
// Body: { project_id: string; supabase_project_ref: string }
// Auth to the Supabase Management API uses env.SUPABASE_MGMT_TOKEN.

async function handleInjectSecret(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get("Origin");

  let body: { project_id?: string; supabase_project_ref?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  const { project_id, supabase_project_ref } = body;
  if (!project_id || !supabase_project_ref) {
    return new Response(JSON.stringify({ error: "Missing required fields: project_id, supabase_project_ref" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  if (!env.SUPABASE_MGMT_TOKEN) {
    return new Response(JSON.stringify({ error: "SUPABASE_MGMT_TOKEN not configured on the gateway" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  // Write LIFEMARK_API_KEY into the target project's edge-function secrets via
  // the Supabase Management API. This endpoint authenticates with a management
  // (personal access) token — a project service-role key is rejected here.
  const mgmtRes = await fetch(
    `https://api.supabase.com/v1/projects/${supabase_project_ref}/secrets`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.SUPABASE_MGMT_TOKEN}`,
      },
      body: JSON.stringify([
        {
          name: "LIFEMARK_API_KEY",
          value: env.GATEWAY_SECRET,
        },
      ]),
    }
  );

  if (!mgmtRes.ok) {
    const err = await mgmtRes.text();
    console.error("[gateway] inject-secret failed:", err);
    return new Response(JSON.stringify({ error: "Failed to inject secret", detail: err }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  // Record that the project now has the key
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/projects?id=eq.${project_id}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ cloud_status: "active" }),
    }
  );

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// ── /health ───────────────────────────────────────────────────────────────────

function handleHealth(env: Env, origin: string | null): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      environment: env.ENVIRONMENT,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    }
  );
}

// ── Audio: TTS + STT (voice features for built apps) ─────────────────────────
//
// Billing:
//   TTS — per character: ceil(chars / 1000) × 2¢  (≈ $15–20 / 1M chars retail)
//   STT — per upload MB: ceil(MB) × 2¢, min 1¢    (≈ $0.006/min retail; 1 MB
//         of compressed speech ≈ 1 minute, so this tracks provider cost)
// Both debit the unified credit balance exactly like chat usage.

const TTS_CENTS_PER_1K_CHARS = 2;
const STT_CENTS_PER_MB = 2;
const TTS_MAX_CHARS = 4096;
const STT_MAX_BYTES = 25 * 1024 * 1024; // OpenAI's own limit

async function handleTextToSpeech(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get("Origin");
  const projectId = request.headers.get("X-Lifemark-Project-Id") ?? "";
  const userId = request.headers.get("X-Lifemark-User-Id") ?? "";

  let body: { model?: string; input?: string; voice?: string; response_format?: string; speed?: number };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
  const input = (body.input ?? "").slice(0, TTS_MAX_CHARS);
  if (!input) {
    return new Response(JSON.stringify({ error: "input (text) is required" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
  if (userId) {
    const balance = await checkAiBalance(userId, env);
    if (balance !== null && balance <= 0) {
      return new Response(JSON.stringify({ error: "Insufficient credits" }), {
        status: 402, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }
  }

  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: body.model ?? "gpt-4o-mini-tts",
      input,
      voice: body.voice ?? "alloy",
      response_format: body.response_format ?? "mp3",
      ...(body.speed ? { speed: body.speed } : {}),
    }),
  });
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    return new Response(errText || JSON.stringify({ error: "TTS upstream failed" }), {
      status: upstream.status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  if (projectId && userId) {
    const cents = Math.max(1, Math.ceil(input.length / 1000) * TTS_CENTS_PER_1K_CHARS);
    ctx.waitUntil(logUsageCents(cents, projectId, userId, env));
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      ...corsHeaders(origin),
    },
  });
}

async function handleTranscription(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get("Origin");
  const projectId = request.headers.get("X-Lifemark-Project-Id") ?? "";
  const userId = request.headers.get("X-Lifemark-User-Id") ?? "";

  if (userId) {
    const balance = await checkAiBalance(userId, env);
    if (balance !== null && balance <= 0) {
      return new Response(JSON.stringify({ error: "Insufficient credits" }), {
        status: 402, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }
  }

  // Pass the multipart form through, defaulting the model when absent.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: "multipart/form-data with a `file` field is required" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "`file` field is required" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
  if (file.size > STT_MAX_BYTES) {
    return new Response(JSON.stringify({ error: "Audio file too large (max 25 MB)" }), {
      status: 413, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
  if (!form.get("model")) form.set("model", "gpt-4o-mini-transcribe");

  const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  const text = await upstream.text();

  if (upstream.ok && projectId && userId) {
    const cents = Math.max(1, Math.ceil(file.size / (1024 * 1024)) * STT_CENTS_PER_MB);
    ctx.waitUntil(logUsageCents(cents, projectId, userId, env));
  }
  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      ...corsHeaders(origin),
    },
  });
}

// ── /v1/embeddings — semantic search / RAG for built apps ────────────────────
//
// OpenAI-compatible embeddings proxy. Generated apps call this (via their
// injected LIFEMARK_API_KEY) to embed text for vector search / RAG without a
// separate provider key. Billed on prompt_tokens like chat, into the unified
// credit balance. Routes text-embedding-* → OpenAI, gemini-embedding-* →
// Google's OpenAI-compatible endpoint.

function resolveEmbeddingUpstream(model: string, env: Env): { url: string; apiKey: string } {
  const m = model.toLowerCase();
  if (m.startsWith("google/") || m.startsWith("gemini")) {
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/embeddings",
      apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    };
  }
  return { url: "https://api.openai.com/v1/embeddings", apiKey: env.OPENAI_API_KEY };
}

async function handleEmbeddings(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get("Origin");
  const projectId = request.headers.get("X-Lifemark-Project-Id") ?? "";
  const userId = request.headers.get("X-Lifemark-User-Id") ?? "";

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  const model = (body.model as string | undefined) ?? "text-embedding-3-small";
  if (body.input === undefined || body.input === null || (typeof body.input === "string" && body.input === "")) {
    return new Response(JSON.stringify({ error: "input (string or string[]) is required" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  if (userId) {
    const balance = await checkAiBalance(userId, env);
    if (balance !== null && balance <= AI_BALANCE_FLOOR_CENTS) {
      return new Response(JSON.stringify({ error: "Credit balance exhausted. Top up your LifemarkAI credits to continue." }), {
        status: 402, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }
  }

  const { url, apiKey } = resolveEmbeddingUpstream(model, env);
  const upstreamModel = model.startsWith("google/") ? model.slice("google/".length) : model;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ ...body, model: upstreamModel }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Upstream unreachable", detail: String(err) }), {
      status: 502, headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", ...corsHeaders(origin) },
    });
  }

  if (projectId && userId) {
    try {
      const parsed = JSON.parse(text) as { usage?: { prompt_tokens?: number; total_tokens?: number } };
      const promptTokens = parsed.usage?.prompt_tokens ?? parsed.usage?.total_tokens ?? 0;
      if (promptTokens > 0) {
        ctx.waitUntil(logUsage({ projectId, userId, promptTokens, completionTokens: 0, model }, env));
      }
    } catch {
      /* non-JSON — skip billing */
    }
  }

  return new Response(text, {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return preflight(origin);
    }

    // Health check — no auth required
    if (url.pathname === "/health" && request.method === "GET") {
      return handleHealth(env, origin);
    }

    // All other endpoints require authentication
    if (!authenticate(request, env)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    // Route dispatch
    if ((url.pathname === "/v1/chat" || url.pathname === "/v1/chat/completions") && request.method === "POST") {
      return handleChat(request, env, ctx);
    }

    // Voice for built apps (Lovable AI-gateway parity): text-to-speech and
    // speech-to-text without a separate provider or API key in the app.
    if (url.pathname === "/v1/audio/speech" && request.method === "POST") {
      return handleTextToSpeech(request, env, ctx);
    }
    if (url.pathname === "/v1/audio/transcriptions" && request.method === "POST") {
      return handleTranscription(request, env, ctx);
    }

    // Embeddings for semantic search / RAG in built apps.
    if (url.pathname === "/v1/embeddings" && request.method === "POST") {
      return handleEmbeddings(request, env, ctx);
    }

    if (url.pathname === "/inject-secret" && request.method === "POST") {
      return handleInjectSecret(request, env, ctx);
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  },
} satisfies ExportedHandler<Env>;
