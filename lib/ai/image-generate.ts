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

async function generateWithDallE(prompt: string, size: ImageSize, style: "vivid" | "natural"): Promise<ImageResult | null> {
  if (!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY) return null;
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
  try {
    const response = await openai.images.generate({
      model: useOpenRouter ? "openai/dall-e-3" : "dall-e-3",
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
 * Generate an image. Tries Gemini, then DALL-E. Returns null only when no
 * provider is configured / both fail.
 */
export async function generateImage(opts: {
  prompt: string;
  size?: ImageSize;
  style?: "vivid" | "natural";
}): Promise<ImageResult | null> {
  const size = opts.size ?? "1024x1024";
  const style = opts.style ?? "vivid";
  return (await generateWithGemini(opts.prompt, size)) ?? (await generateWithDallE(opts.prompt, size, style));
}

/** True when at least one image provider is configured. */
export function isImageGenConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY,
  );
}
