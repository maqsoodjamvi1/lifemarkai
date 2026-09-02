import { isBundlerAsset } from "./bundler-assets.ts";

export interface AssetFile {
  path: string;
  content?: string | null;
  language?: string;
}

export interface MissingAsset {
  importer: string;
  specifier: string;
  resolved: string;
  formatted: string;
}

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="placeholder">
  <rect width="64" height="64" fill="#e5e7eb"/>
  <text x="32" y="36" text-anchor="middle" font-size="10" fill="#6b7280">img</text>
</svg>
`;

const IMAGE_EXT_RE = /\.(svg|png|jpe?g|gif|webp|avif|bmp|ico)$/i;
const STYLE_EXT_RE = /\.(css|scss|sass|less|styl|stylus|pcss|postcss)$/i;

const RELATIVE_IMPORT =
  /(?:^|\n)\s*(?:import\s[^;'"]*?from\s*|import\s*|export\s[^;'"]*?from\s*)['"](\.[^'"]+)['"]/g;
const RELATIVE_REQUIRE = /(?:require|import)\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
const SRC_HREF = /\b(?:src|href)=['"](\/?[^'"]+\.[a-z0-9]+)['"]/gi;
const CSS_URL = /url\(\s*['"]?(\.?\.?\/[^'")\s]+)['"]?\s*\)/gi;

function normalisePath(path: string): string {
  const parts: string[] = [];
  for (const seg of path.replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

function stripQuery(spec: string): string {
  const q = spec.indexOf("?");
  return q === -1 ? spec : spec.slice(0, q);
}

function resolveSpecifier(importer: string, spec: string): string[] {
  const clean = stripQuery(spec).replace(/\\/g, "/");
  if (/^(https?:|data:|blob:|#)/i.test(clean)) return [];
  if (clean.startsWith("/")) {
    const rest = normalisePath(clean.slice(1));
    return [rest, normalisePath(`public/${rest}`)];
  }
  if (!clean.startsWith(".")) return [];
  const dir = importer.includes("/") ? importer.slice(0, importer.lastIndexOf("/")) : "";
  return [normalisePath(`${dir}/${clean}`)];
}

function knownPaths(files: AssetFile[]): Set<string> {
  const known = new Set<string>();
  for (const file of files) {
    if (typeof file.path !== "string") continue;
    const path = normalisePath(file.path);
    known.add(path);
    if (path.startsWith("public/")) known.add(path.slice("public/".length));
  }
  return known;
}

function assetExists(known: Set<string>, resolved: string): boolean {
  if (known.has(resolved)) return true;
  if (known.has(`public/${resolved}`)) return true;
  return false;
}

/**
 * Project-relative images, fonts, CSS, and other bundler assets that are
 * referenced but not present. These used to be exempted from import gates and
 * only showed up as preview 404s after an LLM round.
 */
export function findMissingAssets(files: AssetFile[]): MissingAsset[] {
  const known = knownPaths(files);
  const out: MissingAsset[] = [];
  const seen = new Set<string>();

  const push = (importer: string, specifier: string, resolved: string) => {
    const key = `${importer}|${resolved}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      importer,
      specifier,
      resolved,
      formatted: `${importer} — missing asset "${specifier}" (expected ${resolved})`,
    });
  };

  for (const file of files) {
    if (typeof file.path !== "string" || typeof file.content !== "string") continue;
    const content = file.content;

    for (const re of [RELATIVE_IMPORT, RELATIVE_REQUIRE]) {
      re.lastIndex = 0;
      for (const match of content.matchAll(re)) {
        const spec = match[1];
        if (!isBundlerAsset(spec)) continue;
        for (const resolved of resolveSpecifier(file.path, spec)) {
          if (!assetExists(known, resolved)) push(file.path, spec, resolved);
        }
      }
    }

    if (/\.(html|tsx|jsx|mdx|vue|svelte)$/i.test(file.path) || file.path.endsWith(".html")) {
      SRC_HREF.lastIndex = 0;
      for (const match of content.matchAll(SRC_HREF)) {
        const spec = match[1];
        if (!isBundlerAsset(spec) || /^(https?:|data:|blob:)/i.test(spec)) continue;
        for (const resolved of resolveSpecifier(file.path, spec)) {
          if (!assetExists(known, resolved)) push(file.path, spec, resolved);
        }
      }
    }

    if (STYLE_EXT_RE.test(file.path) || /\.(tsx|jsx|css)$/i.test(file.path)) {
      CSS_URL.lastIndex = 0;
      for (const match of content.matchAll(CSS_URL)) {
        const spec = match[1];
        if (!isBundlerAsset(spec) || /^(https?:|data:)/i.test(spec)) continue;
        for (const resolved of resolveSpecifier(file.path, spec)) {
          if (!assetExists(known, resolved)) push(file.path, spec, resolved);
        }
      }
    }
  }

  return out;
}

function placeholderFor(path: string): { content: string; language: string; writePath: string; rewriteTo?: string } | null {
  const ext = path.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "";
  if (STYLE_EXT_RE.test(path)) {
    return { content: "/* generated placeholder — original asset was missing */\n", language: "css", writePath: path };
  }
  if (ext === ".json") {
    return { content: "{}\n", language: "json", writePath: path };
  }
  if (ext === ".svg" || IMAGE_EXT_RE.test(path)) {
    const writePath = ext === ".svg" ? path : path.replace(IMAGE_EXT_RE, ".svg");
    return {
      content: PLACEHOLDER_SVG,
      language: "xml",
      writePath,
      rewriteTo: ext === ".svg" ? undefined : writePath.replace(/^public\//, "/"),
    };
  }
  if (/\.(txt|md)$/i.test(path)) {
    return { content: "", language: "plaintext", writePath: path };
  }
  return null;
}

export interface AssetRepairResult<T extends AssetFile> {
  files: T[];
  changedPaths: string[];
  createdPaths: string[];
}

/**
 * Create safe placeholders for missing local assets and rewrite image imports
 * to SVG when the original binary file cannot live in project_files text.
 */
export function repairMissingAssets<T extends AssetFile>(files: T[]): AssetRepairResult<T> {
  const missing = findMissingAssets(files);
  if (missing.length === 0) {
    return { files, changedPaths: [], createdPaths: [] };
  }

  const byPath = new Map(files.map((file) => [normalisePath(file.path), { ...file }]));
  const createdPaths: string[] = [];
  const changedPaths = new Set<string>();
  const rewrite = new Map<string, string>();

  for (const issue of missing) {
    const placeholder = placeholderFor(issue.resolved);
    if (!placeholder) continue;
    const writePath = normalisePath(placeholder.writePath);
    if (!byPath.has(writePath)) {
      byPath.set(writePath, {
        path: writePath,
        content: placeholder.content,
        language: placeholder.language,
      } as T);
      createdPaths.push(writePath);
    }
    if (placeholder.rewriteTo && placeholder.rewriteTo !== issue.specifier) {
      rewrite.set(`${issue.importer}|${issue.specifier}`, placeholder.writePath.startsWith("public/")
        ? `/${placeholder.writePath.slice("public/".length)}`
        : specifierToward(issue.specifier, placeholder.writePath));
    }
  }

  for (const [key, nextSpec] of rewrite) {
    const importer = key.slice(0, key.indexOf("|"));
    const specifier = key.slice(key.indexOf("|") + 1);
    const file = byPath.get(normalisePath(importer));
    if (!file || typeof file.content !== "string" || !file.content.includes(specifier)) continue;
    file.content = file.content.split(specifier).join(nextSpec);
    changedPaths.add(file.path);
  }

  return {
    files: [...byPath.values()],
    changedPaths: [...changedPaths],
    createdPaths,
  };
}

function specifierToward(original: string, writePath: string): string {
  if (original.startsWith("/")) {
    return writePath.startsWith("public/") ? `/${writePath.slice("public/".length)}` : `/${writePath}`;
  }
  const origExt = original.match(/\.[a-z0-9]+(?:\?.*)?$/i)?.[0] ?? "";
  const nextExt = writePath.match(/\.[^.]+$/)?.[0] ?? "";
  if (origExt && nextExt) return original.replace(/\.[a-z0-9]+(\?.*)?$/i, `${nextExt}$1`);
  return original;
}
