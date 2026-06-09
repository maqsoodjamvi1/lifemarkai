import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/provider";
import { DEFAULT_CODING_MODEL } from "@/lib/ai/model-defaults";

// ─── POST /api/projects/[id]/ai-proxy ────────────────────────────────────────
// Managed AI proxy for apps built with LifemarkAI.
// Builders enable this in the AI Integration panel; their deployed app calls
// this endpoint without exposing any API keys client-side.
//
// Request:  { messages: [{role,content}], systemPrompt?: string, maxTokens?: number }
// Response: { content: string, model: string, creditsUsed: number }
//
// Authentication: project owner's session OR a project-scoped token header
// Rate-limited by project ai_credit_limit

export const runtime = "nodejs";
export const maxDuration = 30;

interface ProxyRequest {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  // Allow cross-origin calls from deployed apps
  const origin = req.headers.get("origin") ?? "*";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Look up the project — must have ai_integration_enabled
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, ai_integration_enabled, ai_integration_model, ai_credits_used, ai_credit_limit, is_public")
    .eq("id", projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!project.ai_integration_enabled) {
    return NextResponse.json({ error: "AI integration is not enabled for this project" }, { status: 403 });
  }

  // Auth: project owner, a collaborator, OR any request if the project is public
  if (!project.is_public && user?.id !== project.user_id) {
    // Check collaborator access
    const { data: collab } = await (supabase as any)
      .from("collaborators")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user?.id ?? "")
      .single();
    if (!collab) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Credit guard
  if (project.ai_credits_used >= project.ai_credit_limit) {
    return NextResponse.json(
      { error: "AI credit limit reached for this project. Increase the limit in the AI Integration panel." },
      { status: 402 }
    );
  }

  let body: ProxyRequest;
  try {
    body = await req.json() as ProxyRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messages, systemPrompt, maxTokens = 1000, temperature = 0.7 } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  // Build message list — prepend system prompt if provided
  const aiMessages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    aiMessages.push({ role: "system", content: systemPrompt.slice(0, 2000) });
  }
  for (const m of messages.slice(-20)) { // max 20 turns
    aiMessages.push({ role: m.role, content: String(m.content).slice(0, 4000) });
  }

  try {
    const result = await generateAI({
      model: project.ai_integration_model ?? DEFAULT_CODING_MODEL,
      messages: aiMessages as Parameters<typeof generateAI>[0]["messages"],
      maxTokens: Math.min(maxTokens, 2000),
      temperature,
      stream: false,
    });

    // Deduct 1 credit from the project's AI credit pool
    await (supabase as any)
      .from("projects")
      .update({ ai_credits_used: project.ai_credits_used + 1 })
      .eq("id", projectId);

    return NextResponse.json(
      { content: result.content, model: project.ai_integration_model, creditsUsed: project.ai_credits_used + 1 },
      {
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI request failed" },
      { status: 500 }
    );
  }
}

// Preflight for cross-origin requests from deployed apps
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
