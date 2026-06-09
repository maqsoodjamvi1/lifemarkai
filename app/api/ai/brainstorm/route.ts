import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/provider";
import { getFastAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const BRAINSTORM_SYSTEM = `You are a creative app concept generator for an AI-powered app builder.
Given a vague idea, generate exactly 3 specific, distinct, and buildable app concepts as a JSON array.

Each concept must have these exact fields:
- name: short catchy app name (2-4 words, title case)
- emoji: a single relevant emoji
- pitch: one punchy sentence describing what it does and who benefits (max 15 words)
- stack: concise tech recommendation (e.g. "React + Supabase", "Next.js + Stripe + Tailwind")
- accent: exactly one of: "violet", "blue", or "emerald" — vary them across the 3 concepts
- prompt: a rich 2-3 sentence starter prompt for an AI builder describing key pages/features, UI style, color scheme, and any integrations needed

Rules:
- Make the 3 concepts meaningfully different (e.g. B2C vs B2B vs dev tool, or different niches)
- Keep concepts realistic to build with React/Next.js in a single session
- Make "prompt" highly specific — mention layout, key components, data model hints, and visual style
- Return ONLY a valid JSON array, absolutely no other text`;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Rate-limit brainstorm calls (reuse AI limiter)
    const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { idea } = await req.json();
    if (!idea || typeof idea !== "string" || idea.trim().length < 3) {
      return NextResponse.json({ error: "idea is required" }, { status: 400 });
    }
    if (idea.length > 500) {
      return NextResponse.json({ error: "Idea too long (max 500 chars)" }, { status: 400 });
    }

    // Stream from AI
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullText = "";

          await generateAI({
            model: getFastAiModel(),
            messages: [
              { role: "system", content: BRAINSTORM_SYSTEM },
              { role: "user",   content: `Generate 3 app concepts for: "${idea.trim()}"` },
            ],
            temperature: 0.9,
            stream: true,
            onChunk: (chunk: string) => {
              fullText += chunk;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`)
              );
            },
          });

          // Validate JSON before finalising
          const match = fullText.match(/\[[\s\S]*\]/);
          if (match) {
            try {
              JSON.parse(match[0]); // will throw if invalid
            } catch {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ error: "Invalid JSON from AI" })}\n\n`)
              );
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[brainstorm]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
