export const BUILD_WITH_URL_STORAGE_KEY = "lifemark.buildWithUrl";

export interface BuildWithUrlPayload {
  prompt: string;
  images: string[];
  /** Public web pages to use as layout/content/styling references
   *  (Lovable parity: Build-with-URL `html=` references, Jun 16 2026). */
  pages?: string[];
  at: number;
}

/** Parse the session handoff defensively before putting its contents in the UI. */
export function parseBuildWithUrlPayload(raw: string | null): BuildWithUrlPayload | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<BuildWithUrlPayload>;
    if (typeof value.prompt !== "string" || !value.prompt.trim()) return null;
    if (value.prompt.length > 50_000) return null;
    if (!Array.isArray(value.images) || value.images.length > 10) return null;
    if (!value.images.every((image) => typeof image === "string" && image.length <= 10_000)) {
      return null;
    }
    const pages = Array.isArray(value.pages)
      ? value.pages.filter((p) => typeof p === "string" && /^https?:\/\//i.test(p) && p.length <= 2_000).slice(0, 10)
      : [];
    // Lovable's rule: up to 10 references total, images + pages combined.
    if (value.images.length + pages.length > 10) return null;

    return {
      prompt: value.prompt,
      images: value.images,
      pages,
      at: typeof value.at === "number" && Number.isFinite(value.at) ? value.at : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Keep image + page references attached to the build request until the editor opens. */
export function buildPromptFromUrlPayload(payload: BuildWithUrlPayload): string {
  let out = payload.prompt;
  if (payload.images.length > 0) {
    out += `\n\nReference images:\n${payload.images.map((image) => `- ${image}`).join("\n")}`;
  }
  if ((payload.pages?.length ?? 0) > 0) {
    out += `\n\nReference pages:\n${payload.pages!.map((page) => `- ${page}`).join("\n")}`;
  }
  return out;
}
