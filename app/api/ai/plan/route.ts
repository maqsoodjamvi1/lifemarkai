import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { REASONING_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait before generating another plan." },
        { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
      );
    }

    const { projectId, prompt } = await request.json();
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    if (prompt.length > 4000) {
      return NextResponse.json({ error: "Prompt must be under 4000 characters" }, { status: 400 });
    }

    // Verify project ownership
    const { data: project } = await (supabase as any)
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const systemPrompt = `You are a senior software architect. Given a project idea, create a detailed, structured implementation plan.

Return ONLY valid JSON in this exact format:
{
  "title": "Short project title",
  "overview": "One sentence overview of what will be built",
  "tech": ["Next.js 14", "TypeScript", "Supabase", "Tailwind CSS"],
  "steps": [
    {
      "id": "step-1",
      "title": "Step title",
      "description": "What this step implements",
      "category": "ui|api|database|auth|deployment",
      "status": "pending",
      "files": ["list", "of", "files", "created"]
    }
  ]
}

Use exactly 5-7 steps. Categories must be one of: ui, api, database, auth, deployment.
Think strategically: order steps by dependency, call out architectural trade-offs in each description, and surface risks/edge cases the build should handle.`;

    const aiResult = await generateAI({
      // Route planning through the strong reasoning tier (Claude Opus) for
      // genuine strategic planning rather than the default coding model.
      model: REASONING_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Create an implementation plan for: ${prompt}` },
      ],
      temperature: 0.7,
      maxTokens: 8000,
      jsonMode: true,
    });

    // With jsonMode the response is guaranteed to be a JSON object — parse directly
    // with a regex fallback for safety.
    const rawText = aiResult.content.trim();
    let plan: unknown;
    try {
      plan = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Invalid AI response format");
      plan = JSON.parse(jsonMatch[0]);
    }

    // Deduct 1 credit for plan generation
    await (supabase as any).rpc("deduct_credits", { user_id: user.id, amount: 1 }).maybeSingle();

    import("@/lib/stripe/auto-topup")
      .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
      .catch(() => {});

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Plan generation error:", error);
    return NextResponse.json({ error: "Plan generation failed" }, { status: 500 });
  }
}
