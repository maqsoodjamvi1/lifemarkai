import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/generate";
import { CONTENT_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  cancelCreditReservation,
  reserveCredits,
  settleCreditReservation,
} from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert full-stack developer specialising in email integration.
Given a use case description, generate production-ready code for sending emails using the Resend SDK.

Always return a JSON object with this exact shape:
{
  "files": [
    { "path": "string", "content": "string", "language": "string" }
  ]
}

Rules:
- For Next.js (App Router): generate app/api/send-email/route.ts and a React component
- For plain React: generate a serverless function at api/send-email.ts and a React component
- The API route must read RESEND_API_KEY from process.env (never hardcode it)
- The React form component should call the API route with fetch
- Use TypeScript throughout
- Include proper error handling and loading states in the component
- The component should be a named export placed in components/EmailForm.tsx (or similar)
- Keep code clean, minimal, and production-ready
- Never include markdown fences or explanation — only the raw JSON`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json();
  const { projectId, useCase, fromEmail, fromName, framework = "nextjs" } = body;

  if (!useCase || typeof useCase !== "string" || useCase.length > 1000) {
    return NextResponse.json({ error: "Invalid use case" }, { status: 400 });
  }
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const userMessage = `Generate email code for the following use case:
"${useCase}"

Configuration:
- Framework: ${framework}
- From email: ${fromEmail || "noreply@example.com"}
- From name: ${fromName || "My App"}
- Email provider: Resend (npm package "resend")

Return only the JSON object with the generated files.`;

  let reservation: Awaited<ReturnType<typeof reserveCredits>> = null;
  let billableOutput = false;
  let reservationFinalized = false;

  try {
    reservation = await reserveCredits(supabase, {
      userId: user.id,
      amount: 1,
      action: "generate_email",
      projectId,
    });
    if (!reservation) {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }

    const result = await generateAI(
      {
        // Email templates are writing work — content tier, not the coder.
        model: CONTENT_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        maxTokens: 4000,
        temperature: 0.2,
        stream: false,
        jsonMode: true,
      },
      { projectId, userId: user.id, task: "generate_email" },
    );
    billableOutput = true;

    let parsed: { files: Array<{ path: string; content: string; language: string }> };
    try {
      parsed = JSON.parse(result.content);
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
      throw new Error("AI returned no files");
    }

    // Upsert files into the project
    const upserted = [];
    for (const file of parsed.files) {
      const { data, error } = await (supabase as any)
        .from("project_files")
        .upsert(
          { project_id: projectId, path: file.path, content: file.content, language: file.language ?? "typescript" },
          { onConflict: "project_id,path" }
        )
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (data) upserted.push(data);
    }

    await settleCreditReservation(supabase, reservation.id, 1);
    reservationFinalized = true;

    import("@/lib/stripe/auto-topup")
      .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
      .catch(() => {});

    return NextResponse.json({ files: upserted });
  } catch (err) {
    if (reservation && !reservationFinalized) {
      try {
        if (billableOutput) {
          await settleCreditReservation(supabase, reservation.id, 1);
        } else {
          await cancelCreditReservation(supabase, reservation.id);
        }
      } catch (billingError) {
        console.error("[ai/generate-email] Failed to finalize credit reservation", billingError);
      }
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
