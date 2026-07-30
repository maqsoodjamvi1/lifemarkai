/**
 * Generate an image and store it as a permanent project asset, returning a
 * public URL. Used by the in-builder agent's `generate_image` tool so a build
 * can embed a real hero/product image (a URL, NOT a giant data URI) directly
 * into the generated code.
 *
 * Generation uses the shared Gemini→DALL-E helper (server-side keys). The result
 * is uploaded to Supabase Storage so the URL is stable and embeddable. Returns
 * null on any failure so callers can fall back to a stock image URL.
 */
import { createAdminClient } from "@/lib/supabase/server";
import { generateImage, type ImageSize } from "./image-generate";

// Reuse the existing public "previews" bucket (already used for screenshots).
const ASSET_BUCKET = "previews";

function bytesFromDataUri(dataUri: string): { buffer: Buffer; contentType: string } | null {
  const m = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { contentType: m[1], buffer: Buffer.from(m[2], "base64") };
}

export async function generateAndStoreImage(
  projectId: string,
  prompt: string,
  size: ImageSize = "1024x1024",
): Promise<string | null> {
  const result = await generateImage({ prompt, size });
  if (!result) return null;

  try {
    // Obtain raw bytes whether the provider returned a data URI (Gemini) or a
    // hosted URL (DALL-E).
    let bytes: Buffer;
    let contentType = "image/png";
    if (result.url.startsWith("data:")) {
      const parsed = bytesFromDataUri(result.url);
      if (!parsed) return null;
      bytes = parsed.buffer;
      contentType = parsed.contentType;
    } else {
      const res = await fetch(result.url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      contentType = res.headers.get("content-type") ?? "image/png";
      bytes = Buffer.from(await res.arrayBuffer());
    }

    const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
    const path = `app-images/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const admin = await createAdminClient();
    const { error } = await (admin as any).storage
      .from(ASSET_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (error) return null;

    const { data } = (admin as any).storage.from(ASSET_BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch {
    return null;
  }
}
