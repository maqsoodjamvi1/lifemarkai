import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateImage,isImageGenConfigured,type ImageSize } from "@/lib/ai/image-generate";
import { rateLimit } from "@/lib/rate-limit";
import {
consumeProjectAiCredits,
ProjectAiCreditLimitError,
} from "@/lib/ai/project-credit-meter";

// ─── POST /api/projects/[id]/image-proxy ─────────────────────────────────────
// Managed IMAGE generation for apps built with LifemarkAI (Lovable parity).
// A deployed/built app calls this to generate images at runtime (Gemini Nano
// Banana → DALL-E 3) without exposing any API keys client-side. Mirrors the
// chat ai-proxy: gated by ai_integration_enabled + the project's AI credit pool.
//
// Request:  { prompt: string, size?: "1024x1024"|"1792x1024"|"1024x1792", style?: "vivid"|"natural" }
// Response: { url: string, model: string, creditsUsed: number }


const VALID_SIZES = new Set<ImageSize>(["1024x1024", "1792x1024", "1024x1792"]);
const IMAGE_CREDIT_COST = 3;

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

async function handlePOST(req: Request, params: any) {
  const { id: projectId } = params;
  const origin = req.headers.get("origin") ?? "*";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, ai_integration_enabled, ai_credits_used, ai_credit_limit, is_public")
    .eq("id", projectId)
    .single();

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404, headers: cors(origin) });
  }
  if (!project.ai_integration_enabled) {
    return Response.json(
      { error: "AI integration is not enabled for this project" },
      { status: 403, headers: cors(origin) },
    );
  }

  // Auth: owner, collaborator, OR any caller when the project is public.
  if (!project.is_public && user?.id !== project.user_id) {
    const { data: collab } = await supabase
      .from("collaborators")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user?.id ?? "")
      .single();
    if (!collab) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: cors(origin) });
    }
  }

  // Project AI credit pool guard.
  if (project.ai_credits_used + IMAGE_CREDIT_COST > project.ai_credit_limit) {
    return Response.json(
      { error: "AI credit limit reached for this project. Increase it in the AI Integration panel." },
      { status: 402, headers: cors(origin) },
    );
  }

  // Per-project rate limit: 20 images/min.
  const rl = rateLimit(`image-proxy:${projectId}`, { limit: 20, windowMs: 60 });
  if (!rl.success) {
    return Response.json(
      { error: "Image rate limit exceeded (20/min per project)" },
      { status: 429, headers: cors(origin) },
    );
  }

  if (!isImageGenConfigured()) {
    return Response.json(
      { error: "No image provider configured (set GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY)" },
      { status: 502, headers: cors(origin) },
    );
  }

  let body: ProxyRequest;
  try {
    body = (await req.json()) as ProxyRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: cors(origin) });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400, headers: cors(origin) });
  }
  if (prompt.length > 4000) {
    return Response.json({ error: "prompt must be under 4000 characters" }, { status: 400, headers: cors(origin) });
  }
  const size: ImageSize = body.size && VALID_SIZES.has(body.size) ? body.size : "1024x1024";

  try {
    const used = await consumeProjectAiCredits(projectId, IMAGE_CREDIT_COST);
    const result = await generateImage({ prompt, size, style: body.style });
    if (!result) {
      return Response.json({ error: "Image generation failed" }, { status: 502, headers: cors(origin) });
    }

    // Images cost more than a chat call — deduct 3 from the project pool.
    return Response.json(
      { url: result.url, model: result.model, revisedPrompt: result.revisedPrompt, creditsUsed: used },
      { headers: cors(origin) },
    );
  } catch (err) {
    if (err instanceof ProjectAiCreditLimitError) {
      return Response.json(
        { error: err.message },
        { status: 402, headers: cors(origin) },
      );
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 500, headers: cors(origin) },
    );
  }
}

async function handleOPTIONS(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return new Response(null, {
    status: 204,
    headers: { ...cors(origin), "Access-Control-Max-Age": "86400" },
  });
}


export const Route = createFileRoute("/api/projects/$id/image-proxy")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handlePOST(request, params),
      OPTIONS: async ({ request }) => handleOPTIONS(request),
    },
  },
});
