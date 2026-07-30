// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  cancelCreditReservation,
  reserveCredits,
  settleCreditReservation,
} from "@/lib/credits";

const VALID_SIZES = new Set(["1024x1024", "1792x1024", "1024x1792"]);
const VALID_STYLES = new Set(["vivid", "natural"]);

/**
 * Native image generation — Lovable parity. Providers + fallback order live in
 * the shared lib/ai/image-generate.ts chain (native Gemini → OpenRouter
 * gemini-image → native DALL-E); this route adds auth, rate limiting, and the
 * 3-credit billing gate.
 */

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: max 10 image generations per minute
  const rl = rateLimit(user.id, { limit: 10, windowMs: 60 });
  if (!rl.success) {
    return Response.json(
      { error: "Rate limit exceeded. Please wait before generating another image." },
      { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
    );
  }

  const body = await req.json();
  const { prompt, size = "1024x1024", style = "vivid" } = body;

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  if (prompt.length > 4000) {
    return Response.json({ error: "Prompt must be under 4000 characters" }, { status: 400 });
  }
  if (!VALID_SIZES.has(size)) {
    return Response.json({ error: "Invalid size" }, { status: 400 });
  }
  if (!VALID_STYLES.has(style)) {
    return Response.json({ error: "Invalid style" }, { status: 400 });
  }

  // Shared provider chain (lib/ai/image-generate.ts):
  //   1. Native Gemini (GOOGLE_GENERATIVE_AI_API_KEY)
  //   2. OpenRouter → google/gemini-3.1-flash-image via /chat/completions
  //      modalities (openai/dall-e-3 is DELISTED from OpenRouter — the old
  //      images.generate path always failed there)
  //   3. Native DALL-E 3 (OPENAI_API_KEY)
  const { generateImage, isImageGenConfigured } = await import("@/lib/ai/image-generate");
  if (!isImageGenConfigured()) {
    return Response.json(
      { error: "No image provider configured (set GOOGLE_GENERATIVE_AI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY)" },
      { status: 502 },
    );
  }
  let reservation: Awaited<ReturnType<typeof reserveCredits>> = null;
  let billableOutput = false;
  let reservationFinalized = false;

  try {
    reservation = await reserveCredits(supabase, {
      userId: user.id,
      amount: 3,
      action: "image_generation",
    });
    if (!reservation) {
      return Response.json({ error: "Need 3 credits for image generation" }, { status: 402 });
    }

    const generated = await generateImage({
      prompt,
      size: size as "1024x1024" | "1792x1024" | "1024x1792",
      style: style as "vivid" | "natural",
    });
    if (!generated) throw new Error("No image generated");
    billableOutput = true;

    await settleCreditReservation(supabase, reservation.id, 3);
    reservationFinalized = true;

    import("@/lib/stripe/auto-topup")
      .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
      .catch(() => {});

    return Response.json({
      url: generated.url,
      revised_prompt: generated.revisedPrompt,
      model: generated.model,
    });
  } catch (err) {
    if (reservation && !reservationFinalized) {
      try {
        if (billableOutput) {
          await settleCreditReservation(supabase, reservation.id, 3);
        } else {
          await cancelCreditReservation(supabase, reservation.id);
        }
      } catch (billingError) {
        console.error("[ai/image] Failed to finalize credit reservation", billingError);
      }
    }

    return Response.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 500 },
    );
  }
}


export const Route = createFileRoute("/api/ai/image")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
