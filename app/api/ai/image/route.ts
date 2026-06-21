// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { claimDailyCredits } from "@/lib/credits";

const VALID_SIZES = new Set(["1024x1024", "1792x1024", "1024x1792"]);
const VALID_STYLES = new Set(["vivid", "natural"]);

/**
 * Native image generation — Lovable parity:
 *   1. Nano Banana 2 (Gemini 3.1 Flash Image) when GOOGLE_GENERATIVE_AI_API_KEY
 *      is set — best quality, accurate in-image text, ~10x cheaper per image.
 *   2. DALL-E 3 fallback when Google isn't configured or the call fails.
 */
const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

async function generateWithGemini(prompt: string, size: string): Promise<{ url: string; revised_prompt?: string } | null> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;

  // Map DALL-E size conventions to an aspect-ratio hint
  const aspect = size === "1792x1024" ? "16:9" : size === "1024x1792" ? "9:16" : "1:1";

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${prompt}\n\nAspect ratio: ${aspect}.` }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );
    if (!res.ok) {
      console.warn(`[ai/image] Gemini image gen failed (${res.status}); falling back to DALL-E`);
      return null;
    }
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data);
    if (!imagePart) return null;
    const mime = imagePart.inlineData.mimeType ?? "image/png";
    return { url: `data:${mime};base64,${imagePart.inlineData.data}` };
  } catch (err) {
    console.warn("[ai/image] Gemini image gen error; falling back to DALL-E:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: max 10 image generations per minute
  const rl = rateLimit(user.id, { limit: 10, windowMs: 60 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before generating another image." },
      { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
    );
  }

  await claimDailyCredits(supabase, user.id);
  const { data: profile } = await (supabase as any).from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits < 3) return NextResponse.json({ error: "Need 3 credits for image generation" }, { status: 402 });

  const body = await req.json();
  const { prompt, size = "1024x1024", style = "vivid" } = body;

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (prompt.length > 4000) {
    return NextResponse.json({ error: "Prompt must be under 4000 characters" }, { status: 400 });
  }
  if (!VALID_SIZES.has(size)) {
    return NextResponse.json({ error: "Invalid size" }, { status: 400 });
  }
  if (!VALID_STYLES.has(style)) {
    return NextResponse.json({ error: "Invalid style" }, { status: 400 });
  }

  // 1. Nano Banana 2 (Gemini 3.1 Flash Image) — primary
  let result = await generateWithGemini(prompt, size);
  let model = GEMINI_IMAGE_MODEL;

  // 2. DALL-E 3 — fallback
  if (!result) {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "No image provider configured (set GOOGLE_GENERATIVE_AI_API_KEY or OPENAI_API_KEY)" }, { status: 502 });
    }
    // If OPENROUTER_API_KEY is set, route image generation through OpenRouter
    // so a single key can access OpenAI/Anthropic/Google image models.
    const useOpenRouter = !!process.env.OPENROUTER_API_KEY;
    const openai = useOpenRouter
      ? new OpenAI({
          apiKey: process.env.OPENROUTER_API_KEY,
          baseURL: "https://openrouter.ai/api/v1",
          defaultHeaders: {
            "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.com",
            "X-Title": "LifemarkAI",
          },
        })
      : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.images.generate({
      model: useOpenRouter ? "openai/dall-e-3" : "dall-e-3",
      prompt,
      size: size as "1024x1024" | "1792x1024" | "1024x1792",
      style: style as "vivid" | "natural",
      quality: "standard",
      n: 1,
    });
    const url = response.data[0]?.url;
    if (!url) return NextResponse.json({ error: "No image generated" }, { status: 500 });
    result = { url, revised_prompt: response.data[0]?.revised_prompt };
    model = "dall-e-3";
  }

  await (supabase as any).rpc("deduct_credits", { user_id: user.id, amount: 3, action: "image_generation" });

  import("@/lib/stripe/auto-topup")
    .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
    .catch(() => {});

  return NextResponse.json({ url: result.url, revised_prompt: result.revised_prompt, model });
}
