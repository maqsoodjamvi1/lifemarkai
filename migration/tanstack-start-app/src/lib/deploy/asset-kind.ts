/**
 * Pure asset classification — extension → text-or-binary, and content type.
 *
 * Deliberately dependency-free. This lives apart from `build-store.ts` because
 * `build-project.ts` runs inside the deploy worker and must not pull in the
 * Supabase admin client just to ask whether a file is a PNG.
 */

/**
 * Extensions whose bytes are valid UTF-8 text.
 *
 * Everything absent from this list is treated as binary, which is the safe
 * default: reading a binary as utf-8 does not throw, it silently substitutes
 * U+FFFD for every invalid sequence and the asset ships corrupt.
 */
const TEXT_EXTENSIONS = new Set([
  "html", "htm", "css", "js", "mjs", "cjs", "json", "map", "svg", "txt",
  "xml", "webmanifest", "csv", "md", "vtt",
]);

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  cjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  webmanifest: "application/manifest+json",
  csv: "text/csv; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  vtt: "text/vtt",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
  wasm: "application/wasm",
  zip: "application/zip",
};

export function extensionOf(filePath: string): string {
  const base = String(filePath ?? "").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function isTextAsset(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(extensionOf(filePath));
}

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[extensionOf(filePath)] ?? "application/octet-stream";
}

/** Normalise a request path to a build key: no leading slash, no query/hash. */
export function normaliseBuildPath(input: string): string {
  let p = String(input ?? "").split("?")[0].split("#")[0];
  p = p.replace(/\\/g, "/").replace(/^\/+/, "");
  // Reject traversal outright rather than resolving it. These paths come from a
  // URL; `..` has no legitimate meaning in a build key, and every attempt to
  // "normalise it away" is another chance to get the normalisation wrong.
  if (p.split("/").some((seg) => seg === "..")) return "";
  return p;
}
