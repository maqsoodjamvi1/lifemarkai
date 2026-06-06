// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const VALID_SIZES = new Set(["1024x1024", "1792x1024", "1024x1792"]);
const VALID_STYLES = new Set(["vivid", "natural"]);

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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    size: size as "1024x1024" | "1792x1024" | "1024x1792",
    style: style as "vivid" | "natural",
    quality: "standard",
    n: 1,
  });

  const url = response.data[0]?.url;
  if (!url) return NextResponse.json({ error: "No image generated" }, { status: 500 });

  await (supabase as any).rpc("deduct_credits", { user_id: user.id, amount: 3, action: "image_generation" });

  import("@/lib/stripe/auto-topup")
    .then(({ triggerAutoTopupIfNeeded }) => triggerAutoTopupIfNeeded(user.id))
    .catch(() => {});

  return NextResponse.json({ url, revised_prompt: response.data[0]?.revised_prompt });
}
