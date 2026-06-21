import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImage, isImageGenConfigured, type ImageSize } from "@/lib/ai/image-generate";
import { rateLimit } from "@/lib/rate-limit";

// ─── POST /api/projects/[id]/image-proxy ─────────────────────────────────────
// Managed IMAGE generation for apps built with LifemarkAI (Lovable parity).
// A deployed/built app calls this to generate images at runtime (Gemini Nano
// Banana → DALL-E 3) without exposing any API keys client-side. Mirrors the
// chat ai-proxy: gated by ai_integration_enabled + the project's AI credit pool.
//
// Request:  { prompt: string, size?: "1024x1024"|"1792x1024"|"1024x1792", style?: "vivid"|"natural" }
// Response: { url: string, model: string, creditsUsed: number }

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_SIZES = new Set<ImageSize>(["1024x1024", "1792x1024", "1024x1792"]);

interface ProxyRequest {
  prompt: string;
  size?: ImageSize;
  style?: "vivid" | "natural";
}

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const origin = req.headers.get("origin") ?? "*";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, ai_integration_enabled, ai_credits_used, ai_credit_limit, is_public")
    .eq("id", projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: cors(origin) });
  }
  if (!project.ai_integration_enabled) {
    return NextResponse.json(
      { error: "AI integration is not enabled for this project" },
      { status: 403, headers: cors(origin) },
    );
  }

  // Auth: owner, collaborator, OR any caller when the project is public.
  if (!project.is_public && user?.id !== project.user_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: collab } = await (supabase as any)
      .from("collaborators")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user?.id ?? "")
      .single();
    if (!collab) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors(origin) });
    }
  }

  // Project AI credit pool guard.
  if (project.ai_credits_used >= project.ai_credit_limit) {
    return NextResponse.json(
      { error: "AI credit limit reached for this project. Increase it in the AI Integration panel." },
      { status: 402, headers: cors(origin) },
    );
  }

  // Per-project rate limit: 20 images/min.
  const rl = rateLimit(`image-proxy:${projectId}`, { limit: 20, windowMs: 60 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Image rate limit exceeded (20/min per project)" },
      { status: 429, headers: cors(origin) },
    );
  }

  if (!isImageGenConfigured()) {
    return NextResponse.json(
      { error: "No image provider configured (set GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY)" },
      { status: 502, headers: cors(origin) },
    );
  }

  let body: ProxyRequest;
  try {
    body = (await req.json()) as ProxyRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: cors(origin) });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400, headers: cors(origin) });
  }
  if (prompt.length > 4000) {
    return NextResponse.json({ error: "prompt must be under 4000 characters" }, { status: 400, headers: cors(origin) });
  }
  const size: ImageSize = body.size && VALID_SIZES.has(body.size) ? body.size : "1024x1024";

  try {
    const result = await generateImage({ prompt, size, style: body.style });
    if (!result) {
      return NextResponse.json({ error: "Image generation failed" }, { status: 502, headers: cors(origin) });
    }

    // Images cost more than a chat call — deduct 3 from the project pool.
    const used = project.ai_credits_used + 3;
    await (supabase as any).from("projects").update({ ai_credits_used: used }).eq("id", projectId);

    return NextResponse.json(
      { url: result.url, model: result.model, revisedPrompt: result.revisedPrompt, creditsUsed: used },
      { headers: cors(origin) },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 500, headers: cors(origin) },
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return new Response(null, {
    status: 204,
    headers: { ...cors(origin), "Access-Control-Max-Age": "86400" },
  });
}
