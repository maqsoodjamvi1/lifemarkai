import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { DEFAULT_CODING_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a senior UX/UI designer and front-end architect with deep expertise in design systems, accessibility, and user experience.

Analyse the provided code and/or screenshot and return a JSON object with this exact shape:

{
  "score": number,          // overall design score 0–100
  "summary": "string",     // 1–2 sentence high-level verdict
  "suggestions": [
    {
      "id": "string",       // short unique kebab-case id
      "category": "Layout" | "Typography" | "Color" | "Accessibility" | "UX" | "Performance",
      "severity": "good" | "warning" | "error",
      "title": "string",   // short title (≤8 words)
      "detail": "string",  // 1–3 sentence explanation
      "fixPrompt": "string" // ready-to-use chat prompt to fix this (starts with "Fix: ")
    }
  ]
}

Rules:
- Return 6–12 suggestions total — mix of positives (severity: good) and issues
- Be specific — reference actual class names, component names, or patterns you see in the code
- fixPrompt must be actionable and specific enough for an AI to implement it
- Score: 90–100 excellent, 70–89 good, 50–69 needs work, <50 poor
- Only return the raw JSON — no markdown, no explanation`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Grant today's daily free credits before the balance gate (migration 063)
  await (await import("@/lib/credits")).claimDailyCredits(supabase, user.id);
  const { data: profile } = await (supabase as any)
    .from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits <= 0) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const body = await req.json();
  const { projectId, filesSample, screenshotBase64 } = body;

  if (!filesSample || typeof filesSample !== "string") {
    return NextResponse.json({ error: "filesSample required" }, { status: 400 });
  }

  // Build message content — optionally include screenshot for vision analysis
  const textContent = `Analyse the design and UX of this project. Here is a sample of the source code:\n\n${filesSample}`;

  const messages: import("@/lib/ai/provider").AIMessage[] = screenshotBase64
    ? [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text" as const, text: textContent },
            { type: "image_url" as const, image_url: { url: screenshotBase64 } },
          ] as unknown as string,
        },
      ]
    : [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: textContent },
      ];

  try {
    const result = await generateAI({
      model: DEFAULT_CODING_MODEL,
      messages,
      maxTokens: 3000,
      temperature: 0.3,
      stream: false,
      jsonMode: !screenshotBase64, // JSON mode only for text-only requests
    });

    let parsed: {
      score: number;
      summary: string;
      suggestions: Array<{
        id: string;
        category: string;
        severity: string;
        title: string;
        detail: string;
        fixPrompt: string;
      }>;
    };

    try {
      // Strip potential markdown fences when vision model is used
      const raw = result.content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 500 });
    }

    // Deduct 1 credit
    await (supabase as any).rpc("deduct_credits", {
      user_id: user.id,
      amount: 1,
      action: "design_guidance",
      project_id: projectId,
    });

    import("@/lib/stripe/auto-topup")
      .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
      .catch(() => {});

    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
