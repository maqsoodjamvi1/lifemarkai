import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { DEFAULT_CODING_MODEL } from "@/lib/ai/model-defaults";
import { generateImage, isImageGenConfigured, type ImageSize } from "@/lib/ai/image-generate";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/projects/[id]/ai-proxy
// Managed, no-key AI connector for apps built with LifemarkAI.
// Backwards compatible chat request:
//   { messages: [{ role, content }], systemPrompt?, maxTokens?, temperature? }
// Multimodal contract:
//   { capability: "chat", messages, ... }
//   { capability: "image", prompt, size?, style? }
//   { capability: "embedding", input, model? }
//   { capability: "tts", text, voice?, format?, model? }
//   multipart/form-data: capability=stt, file=<audio>, language?, prompt?, model?

export const runtime = "nodejs";
export const maxDuration = 60;

type AiCapability = "chat" | "image" | "embedding" | "stt" | "tts";
type ChatRole = "user" | "assistant" | "system";

interface ProxyRequest {
  capability?: AiCapability;
  messages?: Array<{ role: ChatRole; content: string }>;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  prompt?: string;
  input?: string | string[];
  text?: string;
  size?: ImageSize;
  style?: "vivid" | "natural";
  model?: string;
  voice?: string;
  format?: "mp3" | "opus" | "aac" | "flac";
  language?: string;
}

const VALID_IMAGE_SIZES = new Set<ImageSize>(["1024x1024", "1792x1024", "1024x1792"]);
const VALID_TTS_FORMATS = new Set(["mp3", "opus", "aac", "flac"]);
const MAX_AUDIO_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "audio/x-m4a",
]);

const CAPABILITY_COST: Record<AiCapability, number> = {
  chat: 1,
  image: 3,
  embedding: 1,
  stt: 2,
  tts: 2,
};

const CAPABILITY_RATE_LIMIT: Record<AiCapability, { limit: number; windowMs: number }> = {
  chat: { limit: 60, windowMs: 60 },
  image: { limit: 20, windowMs: 60 },
  embedding: { limit: 120, windowMs: 60 },
  stt: { limit: 20, windowMs: 60 },
  tts: { limit: 30, windowMs: 60 },
};

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(origin: string, body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: cors(origin) });
}

function normalizeCapability(value: unknown): AiCapability {
  return value === "image" || value === "embedding" || value === "stt" || value === "tts" ? value : "chat";
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function createOpenAiCompatibleClient(kind: "embedding" | "audio"): OpenAI | null {
  if (kind === "embedding" && process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  if (kind === "embedding" && process.env.OPENROUTER_API_KEY) {
    return new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.com",
        "X-Title": "LifemarkAI",
      },
    });
  }

  if (kind === "audio" && process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return null;
}

function defaultEmbeddingModel() {
  return process.env.OPENAI_API_KEY ? "text-embedding-3-small" : "openai/text-embedding-3-small";
}

async function readRequestBody(req: NextRequest): Promise<{ body: ProxyRequest; file: File | null; isMultipart: boolean }> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const capability = normalizeCapability(form.get("capability") ?? "stt");
    const file = form.get("file");
    return {
      isMultipart: true,
      file: file instanceof File ? file : null,
      body: {
        capability,
        prompt: typeof form.get("prompt") === "string" ? String(form.get("prompt")) : undefined,
        language: typeof form.get("language") === "string" ? String(form.get("language")) : undefined,
        model: typeof form.get("model") === "string" ? String(form.get("model")) : undefined,
      },
    };
  }

  const body = (await req.json()) as ProxyRequest;
  return { body, file: null, isMultipart: false };
}

interface LogMeta {
  capability: AiCapability;
  model?: string | null;
  tokensUsed?: number;
  startedAt: number;
}

/** Best-effort per-request activity log (admin client → works for public apps). */
async function logAiRequest(
  projectId: string,
  entry: LogMeta & { cost: number; status: "success" | "error"; error?: string },
): Promise<void> {
  try {
    const admin = await createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("ai_request_logs").insert({
      project_id: projectId,
      capability: entry.capability,
      model: entry.model ?? null,
      status: entry.status,
      tokens_used: entry.tokensUsed ?? 0,
      cost: entry.cost,
      duration_ms: Math.max(0, Date.now() - entry.startedAt),
      error: entry.error ?? null,
    });
  } catch {
    /* logging never affects the response */
  }
}

async function consumeCredits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  currentUsed: number,
  cost: number,
  meta?: LogMeta,
): Promise<number> {
  const creditsUsed = currentUsed + cost;
  await supabase.from("projects").update({ ai_credits_used: creditsUsed }).eq("id", projectId);
  if (meta) void logAiRequest(projectId, { ...meta, cost, status: "success" });
  return creditsUsed;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const origin = req.headers.get("origin") ?? "*";
  const startedAt = Date.now();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, ai_integration_enabled, ai_integration_model, ai_credits_used, ai_credit_limit, is_public")
    .eq("id", projectId)
    .single();

  if (!project) {
    return json(origin, { error: "Project not found" }, 404);
  }
  if (!project.ai_integration_enabled) {
    return json(origin, { error: "AI integration is not enabled for this project" }, 403);
  }

  // Auth: project owner, collaborator, or any request if the generated app is public.
  if (!project.is_public && user?.id !== project.user_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: collab } = await (supabase as any)
      .from("collaborators")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user?.id ?? "")
      .single();
    if (!collab) {
      return json(origin, { error: "Unauthorized" }, 401);
    }
  }

  let parsed: { body: ProxyRequest; file: File | null; isMultipart: boolean };
  try {
    parsed = await readRequestBody(req);
  } catch {
    return json(origin, { error: "Invalid request body" }, 400);
  }

  const body = parsed.body;
  const capability = normalizeCapability(body.capability);
  const cost = CAPABILITY_COST[capability];
  const currentUsed = Number(project.ai_credits_used ?? 0);
  const creditLimit = Number(project.ai_credit_limit ?? 0);

  if (currentUsed + cost > creditLimit) {
    return json(
      origin,
      {
        error: "AI credit limit reached for this project. Increase the limit in the AI Integration panel.",
        capability,
        creditsUsed: currentUsed,
        creditLimit,
      },
      402,
    );
  }

  const rl = rateLimit(`ai-proxy:${projectId}:${capability}`, CAPABILITY_RATE_LIMIT[capability]);
  if (!rl.success) {
    return json(origin, { error: `${capability} rate limit exceeded`, resetAt: rl.resetAt }, 429);
  }

  try {
    if (capability === "image") {
      if (!isImageGenConfigured()) {
        return json(origin, { error: "No image provider configured (set GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY)" }, 502);
      }

      const prompt = String(body.prompt ?? "").trim();
      if (!prompt) return json(origin, { error: "prompt is required for image generation" }, 400);
      if (prompt.length > 4000) return json(origin, { error: "prompt must be under 4000 characters" }, 400);

      const size = body.size && VALID_IMAGE_SIZES.has(body.size) ? body.size : "1024x1024";
      const result = await generateImage({ prompt, size, style: body.style });
      if (!result) return json(origin, { error: "Image generation failed" }, 502);

      const creditsUsed = await consumeCredits(supabase as any, projectId, currentUsed, cost, {
        capability,
        model: result.model,
        startedAt,
      });
      return json(origin, {
        capability,
        url: result.url,
        model: result.model,
        revisedPrompt: result.revisedPrompt,
        creditsUsed,
      });
    }

    if (capability === "embedding") {
      const input = body.input;
      const items = Array.isArray(input) ? input : typeof input === "string" ? [input] : [];
      const cleanItems = items.map((item) => item.trim()).filter(Boolean).slice(0, 128);
      if (cleanItems.length === 0) return json(origin, { error: "input is required for embeddings" }, 400);

      const openai = createOpenAiCompatibleClient("embedding");
      if (!openai) {
        return json(origin, { error: "No embeddings provider configured (set OPENAI_API_KEY or OPENROUTER_API_KEY)" }, 502);
      }

      const model = body.model ?? defaultEmbeddingModel();
      const result = await openai.embeddings.create({
        model,
        input: Array.isArray(input) ? cleanItems : cleanItems[0],
      });

      const creditsUsed = await consumeCredits(supabase as any, projectId, currentUsed, cost, {
        capability,
        model: result.model ?? model,
        tokensUsed: result.usage?.total_tokens,
        startedAt,
      });
      return json(origin, {
        capability,
        model: result.model ?? model,
        embeddings: result.data.map((row) => row.embedding),
        usage: result.usage,
        creditsUsed,
      });
    }

    if (capability === "tts") {
      const text = String(body.text ?? "").trim();
      if (!text) return json(origin, { error: "text is required for text-to-speech" }, 400);
      if (text.length > 4000) return json(origin, { error: "text must be under 4000 characters" }, 400);

      const openai = createOpenAiCompatibleClient("audio");
      if (!openai) {
        return json(origin, { error: "No speech provider configured (set OPENAI_API_KEY)" }, 502);
      }

      const format = body.format && VALID_TTS_FORMATS.has(body.format) ? body.format : "mp3";
      const model = body.model ?? "gpt-4o-mini-tts";
      const voice = body.voice ?? "alloy";
      const speech = await openai.audio.speech.create({
        model,
        voice: voice as Parameters<typeof openai.audio.speech.create>[0]["voice"],
        input: text,
        response_format: format,
      });
      const audio = Buffer.from(await speech.arrayBuffer()).toString("base64");
      const mimeType = format === "mp3" ? "audio/mpeg" : `audio/${format}`;
      const creditsUsed = await consumeCredits(supabase as any, projectId, currentUsed, cost, {
        capability,
        model,
        startedAt,
      });

      return json(origin, {
        capability,
        model,
        voice,
        mimeType,
        audio: `data:${mimeType};base64,${audio}`,
        creditsUsed,
      });
    }

    if (capability === "stt") {
      if (!parsed.isMultipart) {
        return json(origin, { error: "speech-to-text requires multipart/form-data with a file field" }, 400);
      }
      if (!parsed.file) return json(origin, { error: "file is required for speech-to-text" }, 400);
      if (parsed.file.size > MAX_AUDIO_FILE_SIZE) {
        return json(origin, { error: "Audio file too large. Maximum is 25MB." }, 413);
      }
      if (parsed.file.type && !ALLOWED_AUDIO_TYPES.has(parsed.file.type)) {
        return json(origin, { error: "Invalid file type. Must be an audio file." }, 415);
      }

      const openai = createOpenAiCompatibleClient("audio");
      if (!openai) {
        return json(origin, { error: "No transcription provider configured (set OPENAI_API_KEY)" }, 502);
      }

      const model = body.model ?? "whisper-1";
      const transcription = await openai.audio.transcriptions.create({
        file: parsed.file,
        model,
        language: body.language?.slice(0, 16),
        prompt: body.prompt?.slice(0, 500),
      });
      const creditsUsed = await consumeCredits(supabase as any, projectId, currentUsed, cost, {
        capability,
        model,
        startedAt,
      });

      return json(origin, {
        capability,
        model,
        text: transcription.text,
        creditsUsed,
      });
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json(origin, { error: "messages array required" }, 400);
    }

    const aiMessages: Array<{ role: ChatRole; content: string }> = [];
    if (body.systemPrompt) {
      aiMessages.push({ role: "system", content: body.systemPrompt.slice(0, 2000) });
    }
    for (const message of messages.slice(-20)) {
      if (!["user", "assistant", "system"].includes(message.role)) continue;
      aiMessages.push({ role: message.role, content: String(message.content).slice(0, 4000) });
    }

    if (aiMessages.length === 0) {
      return json(origin, { error: "messages array required" }, 400);
    }

    const selectedModel = body.model ?? project.ai_integration_model ?? DEFAULT_CODING_MODEL;
    const result = await generateAI(
      {
        model: selectedModel,
        messages: aiMessages,
        maxTokens: clampNumber(body.maxTokens, 1000, 1, 2000),
        temperature: clampNumber(body.temperature, 0.7, 0, 2),
        stream: false,
      },
      { projectId, userId: project.user_id },
    );

    const creditsUsed = await consumeCredits(supabase as any, projectId, currentUsed, cost, {
      capability,
      model: result.model ?? selectedModel,
      tokensUsed: result.tokensUsed,
      startedAt,
    });
    return json(origin, {
      capability,
      content: result.content,
      model: result.model ?? selectedModel,
      tokensUsed: result.tokensUsed,
      creditsUsed,
    });
  } catch (err) {
    void logAiRequest(projectId, {
      capability,
      model: body.model ?? null,
      cost: 0,
      startedAt,
      status: "error",
      error: err instanceof Error ? err.message : "AI request failed",
    });
    return json(origin, { error: err instanceof Error ? err.message : "AI request failed", capability }, 500);
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return new Response(null, {
    status: 204,
    headers: { ...cors(origin), "Access-Control-Max-Age": "86400" },
  });
}
