/**
 * The file types a bundler resolves natively, in ONE place.
 *
 * Two separate checks answer "does this import resolve to a project file?" —
 * findUnresolvedLocalImports (typecheck-gate.ts) and findMissingModules
 * (export-contract.ts). Both must exempt assets, because a bundler serves
 * `import logo from "./logo.svg"` without any .ts file existing, and reporting
 * it as a missing module fails a build over correct code.
 *
 * Both had their own copy of the list, and the copies drifted. Measured across
 * seventeen extensions before this module existed:
 *
 *   .ico .txt .md            exempt in export-contract, REPORTED by typecheck-gate
 *   .woff .woff2 .ttf        exempt in typecheck-gate, REPORTED by export-contract
 *   .otf .eot .mp4 .webm
 *   .mp3 .wav                REPORTED by both
 *
 * So a generated app that imported a font failed one check, one that imported a
 * favicon failed the other, and anything with a video or an audio clip failed
 * both — each time with "no such file exists in the project", each time about a
 * file the bundler was perfectly happy to serve.
 *
 * Keeping two lists in step by hand is what already failed, so the fix is one
 * list and no second copy. Adding an extension here fixes it everywhere at once.
 *
 * A THIRD copy lived in preview/normalize-imports.ts, which the export-contract
 * comment openly referenced ("same exemptions as normalize-imports.ts") without
 * anything enforcing it. It was the most complete of the three and uniquely
 * carried `.glsl`, so consolidating naively would have introduced a NEW false
 * positive on shader imports — the sets were diffed before merging, not
 * assumed.
 *
 * Covers Vite's default assetsInclude plus the stylesheet dialects. It is
 * deliberately generous: a missed extension fails a real build, while an extra
 * one only means a genuinely missing asset is caught by the render instead of
 * by a static check — a much cheaper mistake.
 */
export const BUNDLER_ASSET_RE =
  /\.(css|scss|sass|less|styl|stylus|pcss|postcss|svg|png|jpe?g|gif|webp|avif|bmp|ico|json|txt|md|woff2?|ttf|otf|eot|mp4|webm|ogv|mov|mp3|wav|flac|aac|ogg|opus|pdf|wasm|glsl|glb|gltf)$/i;

/** True when a specifier points at something the bundler handles, not a JS module. */
export function isBundlerAsset(specifier: string): boolean {
  const q = specifier.indexOf("?");
  return BUNDLER_ASSET_RE.test(q === -1 ? specifier : specifier.slice(0, q));
}
