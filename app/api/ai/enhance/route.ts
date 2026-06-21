/**
 * POST /api/ai/enhance — prompt enhancer.
 *
 * Turns a vague user prompt into a precise, self-contained build prompt before
 * generation. Pattern adapted from bolt.diy's /api/enhancer. Cheap helper (no
 * credit charge) — rate-limited like autocomplete.
 *
 * Body: { prompt: string }  →  { enhanced: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { generateAI } from "@/lib/ai/generate";
import { BALANCED_CODING_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

const ENHANCER_SYSTEM = `You are a professional prompt engineer for an AI app builder.
Rewrite the user's app/website request (in <original_prompt>) into a single, precise,
self-contained build prompt.

For a valid request:
- Make the intent explicit and unambiguous.
- Add the concrete pages/sections, key features, and any obvious data/entities implied.
- Add sensible UX + design intent (layout, tone) when missing.
- Remove redundancy; keep the user's core idea and any specifics they gave.
- Keep it concise — a tight paragraph or short bullet list, not an essay.

For a vague/unclear request:
- Produce the best reasonable interpretation as a buildable prompt (do NOT ask questions).

IMPORTANT: Output ONLY the enhanced prompt text — no preamble, explanations, or tags.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prompt } = (await req.json()) as { prompt?: string };
  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const rl = await rateLimitAsync(`enhance:${user.id}`, RATE_LIMITS.ai);
  if (!rl.success) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  try {
    const result = await generateAI(
      {
        model: BALANCED_CODING_MODEL,
        messages: [
          { role: "system", content: ENHANCER_SYSTEM },
          { role: "user", content: `<original_prompt>\n${prompt.trim()}\n</original_prompt>` },
        ],
        temperature: 0.5,
        maxTokens: 800,
      },
      { userId: user.id },
    );
    const enhanced = result.content.trim();
    return NextResponse.json({ enhanced: enhanced || prompt });
  } catch (err) {
    // Never block the user — fall back to the original prompt on failure.
    return NextResponse.json({ enhanced: prompt, error: err instanceof Error ? err.message : "enhance failed" });
  }
}
