/**
 * ChatGPT Action — createProject endpoint.
 *
 * Called by a Custom GPT (or anyone using the OpenAPI spec at
 * /api/integrations/openai/openapi.json) to create a new LifemarkAI project
 * from a prompt and return its editor URL.
 *
 * Authentication: API key in the `X-LifemarkAI-Key` header. Keys are
 * provisioned in /dashboard/settings → API keys; the key must include the
 * `projects:create` scope. This is the same shape /api/ai/chat uses for
 * programmatic access, so users only need one key for both flows.
 *
 * Request body (JSON):
 *   {
 *     "prompt": "Build a calorie tracking app with Supabase",
 *     "framework": "react" | "next" | "vue" | "svelte" | "vanilla",  // optional, defaults to "react"
 *     "name": "Calorie Tracker"                                       // optional, defaults from prompt
 *   }
 *
 * Response (200):
 *   {
 *     "projectId": "uuid",
 *     "editorUrl": "https://lifemarkai.com/editor/uuid",
 *     "name": "Calorie Tracker",
 *     "next": "Open the editor URL to watch the AI build your app."
 *   }
 *
 * Errors:
 *   401 — missing/invalid API key
 *   403 — key missing the projects:create scope
 *   400 — missing/invalid body
 *   500 — Supabase insert failed
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/app/api/keys/route";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 15;

interface CreateBody {
  prompt?: string;
  framework?: "react" | "next" | "vue" | "svelte" | "vanilla";
  name?: string;
}

/** CORS: ChatGPT calls from a browser context, so we need permissive CORS for the
 *  OPTIONS preflight. The actual key validation gates the resource. */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-LifemarkAI-Key, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Pick a sensible project name from the prompt when the caller didn't supply one. */
function deriveName(prompt: string): string {
  // Strip leading "Build a/an/the …" prefixes and take the first ~6 words.
  const cleaned = prompt
    .replace(/^(please\s+)?(build|create|make|generate)\s+(a|an|the)\s+/i, "")
    .replace(/[.!?].*$/, "")
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 6).join(" ");
  // Title-case the first letter; keep the rest as-is so brand names look right.
  return words.charAt(0).toUpperCase() + words.slice(1) || "Untitled project";
}

export async function POST(req: NextRequest) {
  // ── Auth: API key (Bearer OR custom header) ────────────────────────────────
  // ChatGPT Actions support both shapes; let users use either depending on how
  // they configured the Custom GPT.
  const headerKey =
    req.headers.get("x-lifemarkai-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!headerKey) {
    return NextResponse.json(
      { error: "Missing API key. Set X-LifemarkAI-Key or Authorization: Bearer <key>." },
      { status: 401, headers: CORS_HEADERS },
    );
  }
  const auth = await validateApiKey(headerKey);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or expired API key." }, { status: 401, headers: CORS_HEADERS });
  }
  if (!auth.scopes.includes("projects:create")) {
    return NextResponse.json(
      {
        error: "API key is missing the `projects:create` scope. Re-issue it from /dashboard/settings → API keys.",
      },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  // ── Rate limit per user (re-uses the same bucket as /api/ai/chat) ─────────
  const rl = await rateLimitAsync(auth.userId, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before sending another request." },
      { status: 429, headers: { ...CORS_HEADERS, "X-RateLimit-Reset": String(rl.resetAt) } },
    );
  }

  // ── Body validation ────────────────────────────────────────────────────────
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: CORS_HEADERS });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt || prompt.length < 5) {
    return NextResponse.json(
      { error: "prompt is required and must be at least 5 characters." },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  if (prompt.length > 4000) {
    return NextResponse.json(
      { error: "prompt is too long (max 4000 characters)." },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  const framework: NonNullable<CreateBody["framework"]> =
    ["react", "next", "vue", "svelte", "vanilla"].includes(body.framework ?? "")
      ? (body.framework as NonNullable<CreateBody["framework"]>)
      : "react";

  const name = (body.name?.trim() || deriveName(prompt)).slice(0, 80);

  // ── Create the project ────────────────────────────────────────────────────
  // We use the admin client because the caller authenticates via an API key,
  // not a Supabase session. The user_id is taken from the validated key.
  const supabase = await createAdminClient();
  const { data: project, error } = await (supabase as any)
    .from("projects")
    .insert({
      user_id: auth.userId,
      name,
      description: prompt,
      framework,
      status: "active",
      is_public: false,
      // The initial prompt is stored in description AND echoed into a starter
      // message so the editor opens with the user's request already queued.
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to create project: ${error.message}` },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  // Queue the initial prompt as a user message so the editor opens with it
  // pre-filled (handleStarterPrompt in chat-panel picks this up).
  await (supabase as any).from("messages").insert({
    project_id: project.id,
    role: "user",
    content: prompt,
    model: null,
    tokens_used: 0,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.com";
  return NextResponse.json(
    {
      projectId: project.id,
      editorUrl: `${baseUrl}/editor/${project.id}`,
      name: project.name,
      next: "Open the editor URL to watch the AI build your app.",
    },
    { status: 201, headers: CORS_HEADERS },
  );
}
