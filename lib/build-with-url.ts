export const BUILD_WITH_URL_STORAGE_KEY = "lifemark.buildWithUrl";

export interface BuildWithUrlPayload {
  prompt: string;
  images: string[];
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

    return {
      prompt: value.prompt,
      images: value.images,
      at: typeof value.at === "number" && Number.isFinite(value.at) ? value.at : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Keep image references attached to the build request until the editor opens. */
export function buildPromptFromUrlPayload(payload: BuildWithUrlPayload): string {
  if (payload.images.length === 0) return payload.prompt;

  return `${payload.prompt}\n\nReference images:\n${payload.images
    .map((image) => `- ${image}`)
    .join("\n")}`;
}
