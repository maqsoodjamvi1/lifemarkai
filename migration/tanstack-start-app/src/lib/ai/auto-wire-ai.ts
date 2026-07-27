/**
 * In-app AI connector auto-wiring (Lovable built-in-AI parity).
 *
 * When a build/agent run needs runtime AI inside the generated app (chatbot,
 * summaries, embeddings/RAG, image, TTS/STT), this module:
 *   1. Enables the project's managed AI endpoint (projects.ai_integration_enabled)
 *      so /api/projects/[id]/ai-proxy starts accepting calls.
 *   2. Injects the REAL proxy URL into the app's .env.local
 *      (VITE_LIFEMARK_AI_PROXY) — no hardcoded PROJECT_ID, no keys in the browser.
 *   3. Scaffolds a typed src/lib/ai.ts helper (chat/image/embed/tts/stt) so
 *      generated code calls the connector cleanly.
 *
 * Best-effort: wiring failures never fail the build. Mirrors lib/cloud/auto-wire.ts.
 */
import { ENV_FILE_PATH, parseEnvFile, serializeEnvFile } from "@/lib/project/env-file";

export interface AiWireResult {
  intentDetected: boolean;
  enabled: boolean;        // enabled during this call
  envInjected: boolean;
  scaffoldAdded: boolean;
  notes: string[];
}

interface GeneratedFile {
  path: string;
  content: string;
  language?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

const AI_INTENT_RE =
  /\b(chat\s?bot|ai assistant|ai[- ]powered|ai feature|summari[sz]e|summary of|sentiment|classif(y|ication)|semantic search|embeddings?|retrieval[- ]augmented|\brag\b|translat(e|ion)|transcrib(e|ing)|speech[- ]to[- ]text|text[- ]to[- ]speech|voice (assistant|input|note|chat)|read aloud|narrat(e|ion|or)|\bllm\b|generate (an? )?(image|illustration|picture))\b/i;

/** Does generated code already call the AI proxy? Strongest signal. */
function usesAiProxy(files: GeneratedFile[]): boolean {
  return files.some(
    (f) => /ai-proxy/.test(f.content ?? "") || /VITE_LIFEMARK_AI_PROXY|from ["']@?\/?.*lib\/ai["']/.test(f.content ?? ""),
  );
}

/** Does this prompt / output need runtime in-app AI? */
export function detectAiIntent(prompt: string, files: GeneratedFile[]): boolean {
  return usesAiProxy(files) || AI_INTENT_RE.test(prompt ?? "");
}

const PROXY_ENV = "VITE_LIFEMARK_AI_PROXY";

function proxyUrl(projectId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.com").replace(/\/$/, "");
  return `${base}/api/projects/${projectId}/ai-proxy`;
}

const AI_CLIENT_SCAFFOLD = `// Auto-configured by LifemarkAI — managed AI, no API keys needed.
// Calls route through your project's AI proxy; provider credentials stay server-side.
const AI_PROXY = (import.meta.env.${PROXY_ENV} as string) || "";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

async function postJSON(body: Record<string, unknown>) {
  if (!AI_PROXY) throw new Error("AI proxy not configured (${PROXY_ENV} missing).");
  const res = await fetch(AI_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "AI request failed");
  return data;
}

/** Conversational / text: chatbot, summary, classify, translate, Q&A. */
export async function aiChat(
  messages: ChatMessage[],
  opts: { systemPrompt?: string; model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const data = await postJSON({ capability: "chat", messages, ...opts });
  return data.content as string;
}

/** Generate an image; returns a usable URL. */
export async function aiImage(
  prompt: string,
  opts: { size?: "1024x1024" | "1792x1024" | "1024x1792"; style?: "vivid" | "natural" } = {},
): Promise<string> {
  const data = await postJSON({ capability: "image", prompt, ...opts });
  return data.url as string;
}

/** Embeddings for semantic search / RAG. */
export async function aiEmbed(input: string | string[], opts: { model?: string } = {}): Promise<number[][]> {
  const data = await postJSON({ capability: "embedding", input, ...opts });
  return data.embeddings as number[][];
}

/** Text-to-speech; returns a data: URL you can drop into <audio src>. */
export async function aiSpeak(
  text: string,
  opts: { voice?: string; format?: "mp3" | "opus" | "aac" | "flac"; model?: string } = {},
): Promise<string> {
  const data = await postJSON({ capability: "tts", text, ...opts });
  return data.audio as string;
}

/** Speech-to-text; pass an audio File/Blob from an <input type="file"> or recorder. */
export async function aiListen(file: Blob, opts: { language?: string; prompt?: string; model?: string } = {}): Promise<string> {
  if (!AI_PROXY) throw new Error("AI proxy not configured (${PROXY_ENV} missing).");
  const form = new FormData();
  form.append("capability", "stt");
  form.append("file", file);
  if (opts.language) form.append("language", opts.language);
  if (opts.prompt) form.append("prompt", opts.prompt);
  if (opts.model) form.append("model", opts.model);
  const res = await fetch(AI_PROXY, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Transcription failed");
  return data.text as string;
}
`;

async function upsertProjectFile(
  supabase: SupabaseClient,
  projectId: string,
  path: string,
  content: string,
  language = "typescript",
): Promise<void> {
  await supabase.from("project_files").upsert(
    { project_id: projectId, path, content, language },
    { onConflict: "project_id,path" },
  );
}

/**
 * Main entry — call after generated files are persisted (next to autoWireBackend).
 */
export async function autoWireAi(opts: {
  supabase: SupabaseClient;
  projectId: string;
  prompt: string;
  generatedFiles: GeneratedFile[];
  emit?: (status: string) => void;
}): Promise<AiWireResult | null> {
  const { supabase, projectId, prompt, generatedFiles } = opts;
  const emit = opts.emit ?? (() => {});
  const result: AiWireResult = {
    intentDetected: false,
    enabled: false,
    envInjected: false,
    scaffoldAdded: false,
    notes: [],
  };

  if (!detectAiIntent(prompt, generatedFiles)) return null;
  result.intentDetected = true;

  const { data: project } = await supabase
    .from("projects")
    .select("id, ai_integration_enabled")
    .eq("id", projectId)
    .single();
  if (!project) return result;

  // 1. Enable the managed AI endpoint
  if (!project.ai_integration_enabled) {
    emit("Enabling in-app AI for your app…");
    try {
      await supabase.from("projects").update({ ai_integration_enabled: true }).eq("id", projectId);
      result.enabled = true;
      result.notes.push("In-app AI enabled — your app can call chat, image, embeddings, and voice with no keys.");
    } catch (err) {
      result.notes.push(`Could not enable in-app AI: ${err instanceof Error ? err.message : "unknown error"}`);
      return result;
    }
  }

  // 2. Inject the real proxy URL into .env.local (browser-safe, build-time VITE_)
  try {
    const { data: envRow } = await supabase
      .from("project_files")
      .select("id, content")
      .eq("project_id", projectId)
      .eq("path", ENV_FILE_PATH)
      .maybeSingle();
    const env = parseEnvFile(envRow?.content ?? "");
    const url = proxyUrl(projectId);
    if (env[PROXY_ENV] !== url) {
      env[PROXY_ENV] = url;
      await upsertProjectFile(supabase, projectId, ENV_FILE_PATH, serializeEnvFile(env), "plaintext");
    }
    result.envInjected = true;
  } catch {
    /* env injection is best-effort */
  }

  // 3. Scaffold src/lib/ai.ts when the app uses AI (and it isn't already present)
  try {
    const { data: existing } = await supabase
      .from("project_files")
      .select("id")
      .eq("project_id", projectId)
      .in("path", ["src/lib/ai.ts", "src/lib/ai.js"])
      .limit(1)
      .maybeSingle();
    if (!existing) {
      await upsertProjectFile(supabase, projectId, "src/lib/ai.ts", AI_CLIENT_SCAFFOLD);
      result.scaffoldAdded = true;
      emit("Added AI helper (src/lib/ai.ts) ✓");
    }
  } catch {
    /* scaffold is best-effort */
  }

  return result;
}
