// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { generateAI } from "@/lib/ai/generate";
import { ECONOMY_CHAT_MODEL } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Native /api/ai/enhance — prompt enhancer (TRUE NATIVE, no worker).
 * Turns a vague prompt into a precise build prompt. Cheap helper (no credit
 * charge), rate-limited. Body: { prompt } → { enhanced }.
 */
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

export const Route = createFileRoute("/api/ai/enhance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt || !prompt.trim()) {
          return Response.json({ error: "prompt is required" }, { status: 400 });
        }

        const rl = await rateLimitAsync(`enhance:${user.id}`, RATE_LIMITS.ai);
        if (!rl.success) return Response.json({ error: "Rate limited" }, { status: 429 });

        try {
          const result = await generateAI(
            {
              model: ECONOMY_CHAT_MODEL,
              messages: [
                { role: "system", content: ENHANCER_SYSTEM },
                { role: "user", content: `<original_prompt>\n${prompt.trim()}\n</original_prompt>` },
              ],
              temperature: 0.5,
              maxTokens: 800,
            },
            { userId: user.id, task: "prompt_enhancement" },
          );
          const enhanced = result.content.trim();
          return Response.json({ enhanced: enhanced || prompt });
        } catch (err) {
          // Never block the user — fall back to the original prompt on failure.
          return Response.json({ enhanced: prompt, error: err instanceof Error ? err.message : "enhance failed" });
        }
      },
    },
  },
});
