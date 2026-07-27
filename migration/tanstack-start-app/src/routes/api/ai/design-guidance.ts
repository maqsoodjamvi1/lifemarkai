// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { generateAI } from "@/lib/ai/generate";
import { DESIGN_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  cancelCreditReservation,
  reserveCredits,
  settleCreditReservation,
} from "@/lib/credits";


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

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json();
  const { projectId, filesSample, screenshotBase64 } = body;

  if (!filesSample || typeof filesSample !== "string") {
    return Response.json({ error: "filesSample required" }, { status: 400 });
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

  let reservation: Awaited<ReturnType<typeof reserveCredits>> = null;
  let billableOutput = false;
  let reservationFinalized = false;

  try {
    reservation = await reserveCredits(supabase, {
      userId: user.id,
      amount: 1,
      action: "design_guidance",
      projectId,
    });
    if (!reservation) {
      return Response.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const result = await generateAI(
      {
        // Design critique → design tier (aesthetics-tuned, cheaper).
        model: DESIGN_MODEL,
        messages,
        maxTokens: 3000,
        temperature: 0.3,
        stream: false,
        jsonMode: !screenshotBase64, // JSON mode only for text-only requests
      },
      { projectId, userId: user.id, task: "design_guidance" },
    );
    billableOutput = true;

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
      throw new Error("AI returned invalid JSON");
    }

    await settleCreditReservation(supabase, reservation.id, 1);
    reservationFinalized = true;

    import("@/lib/stripe/auto-topup")
      .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
      .catch(() => {});

    return Response.json(parsed);
  } catch (err) {
    if (reservation && !reservationFinalized) {
      try {
        if (billableOutput) {
          await settleCreditReservation(supabase, reservation.id, 1);
        } else {
          await cancelCreditReservation(supabase, reservation.id);
        }
      } catch (billingError) {
        console.error("[ai/design-guidance] Failed to finalize credit reservation", billingError);
      }
    }

    return Response.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}


export const Route = createFileRoute("/api/ai/design-guidance")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
