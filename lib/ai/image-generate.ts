/**
 * Shared image generation — Gemini (Nano Banana) primary, DALL-E 3 fallback.
 *
 * Server-side only: reads provider keys from env and never exposes them. Used by
 * both the in-builder route (/api/ai/image) and the built-app runtime proxy
 * (/api/projects/[id]/image-proxy). Returns a data: URL (Gemini) or a hosted
 * URL (DALL-E), plus which model produced it.
 */
import OpenAI from "openai";

export type ImageSize = "1024x1024" | "1792x1024" | "1024x1792";

export interface ImageResult {
  url: string;
  model: string;
  revisedPrompt?: string;
}

const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

async function generateWithGemini(prompt: string, size: ImageSize): Promise<ImageResult | null> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;
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
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
    };
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) return null;
    const mime = imagePart.inlineData.mimeType ?? "image/png";
    return { url: `data:${mime};base64,${imagePart.inlineData.data}`, model: GEMINI_IMAGE_MODEL };
  } catch {
    return null;
  }
}

const OPENROUTER_IMAGE_MODEL = "google/gemini-3.1-flash-image";

/**
 * OpenRouter image generation. Image-output models on OpenRouter (Gemini
 * image family, GPT image family) are served via /chat/completions with
 * `modalities: ["image","text"]` — NOT the OpenAI /images endpoint, and
 * `openai/dall-e-3` is no longer listed there (verified against the live
 * catalog, July 2026). The generated image arrives as a data: URL in
 * message.images[0].image_url.url.
 */
async function generateWithOpenRouterImage(prompt: string, size: ImageSize): Promise<ImageResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  // Balance guard: image gen is a paid call outside provider.ts's choke point.
  try {
    const { assertOpenRouterFunds } = await import("./openrouter-balance");
    await assertOpenRouterFunds(OPENROUTER_IMAGE_MODEL);
  } catch {
    return null; // chain falls through to the next provider / clear route error
  }
  const aspect = size === "1792x1024" ? "16:9" : size === "1024x1792" ? "9:16" : "1:1";
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.com",
        "X-Title": "LifemarkAI",
      },
      body: JSON.stringify({
        model: OPENROUTER_IMAGE_MODEL,
        modalities: ["image", "text"],
        messages: [{ role: "user", content: `${prompt}\n\nAspect ratio: ${aspect}.` }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{
        message?: { images?: Array<{ image_url?: { url?: string } }> };
      }>;
    };
    const url = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) return null;
    return { url, model: OPENROUTER_IMAGE_MODEL };
  } catch {
    return null;
  }
}

async function generateWithDallE(prompt: string, size: ImageSize, style: "vivid" | "natural"): Promise<ImageResult | null> {
  // Native OpenAI key only — dall-e-3 is delisted from OpenRouter, so the
  // OpenRouter path lives in generateWithOpenRouterImage instead.
  if (!process.env.OPENAI_API_KEY) return null;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      size,
      style,
      quality: "standard",
      n: 1,
    });
    const url = response.data?.[0]?.url;
    if (!url) return null;
    return { url, model: "dall-e-3", revisedPrompt: response.data?.[0]?.revised_prompt };
  } catch {
    return null;
  }
}

/**
 * Generate an image. Tries native Gemini, then OpenRouter (Gemini image via
 * the single OpenRouter key), then native DALL-E. Returns null only when no
 * provider is configured / all fail.
 */
export async function generateImage(opts: {
  prompt: string;
  size?: ImageSize;
  style?: "vivid" | "natural";
}): Promise<ImageResult | null> {
  const size = opts.size ?? "1024x1024";
  const style = opts.style ?? "vivid";
  const result =
    (await generateWithGemini(opts.prompt, size)) ??
    (await generateWithOpenRouterImage(opts.prompt, size)) ??
    (await generateWithDallE(opts.prompt, size, style));
  if (!result) return null;

  // AI-provenance labeling (Lovable parity): embed IPTC/XMP
  // "trainedAlgorithmicMedia" metadata into PNG/JPEG data-URLs so platforms
  // that read provenance can label the image as AI-generated. Hosted URLs
  // (DALL-E) are left as-is — we can't rewrite OpenAI's file.
  if (/^data:image\/(png|jpe?g);base64,/.test(result.url)) {
    try {
      const { addDataUrlAiProvenance } = await import("./image-provenance");
      result.url = addDataUrlAiProvenance(result.url);
    } catch { /* provenance is best-effort — never fail generation */ }
  }
  return result;
}

/** True when at least one image provider is configured. */
export function isImageGenConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY,
  );
}
