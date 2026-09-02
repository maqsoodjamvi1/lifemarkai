import type { ProjectFile } from "../../types/database.ts";

export type PreviewEngine = "detecting" | "static" | "sandbox" | "webcontainer" | "unavailable";

/** Set in sessionStorage when WebContainer.boot() fails — skip retrying this session. */
export const WC_UNAVAILABLE_KEY = "lifemark-wc-unavailable";

/**
 * DRAFT ONLY — in-browser WebContainer.
 * Lovable / Lifemark product preview is Modal sandboxes only.
 * Never enable for product UX unless explicitly opted in.
 */
export function isWebContainerPreviewEnabled(): boolean {
  // RE-ENABLED as an opt-in fallback (Modal spend limits make a zero-cost,
  // runs-on-the-user's-machine engine genuinely useful).
  //
  // Set NEXT_PUBLIC_PREVIEW_WEBCONTAINER=1 (or VITE_PREVIEW_WEBCONTAINER=1) to
  // turn it on. Modal remains the default whenever it is configured.
  //
  // TWO THINGS MUST BE TRUE or this silently does nothing:
  //  1. the key is listed in vite.config.ts `define:` — Vite does not expose
  //     process.env to the browser, so an unlisted key is never substituted;
  //  2. the page is CROSS-ORIGIN ISOLATED (COOP/COEP headers) — WebContainer
  //     needs SharedArrayBuffer, which browsers gate behind isolation.
  //
  // NOTE FOR ANYONE DELETING WEBCONTAINER CODE: do NOT delete
  // `patch-vite-for-webcontainer.ts`. Despite the name it is NOT
  // WebContainer-specific — `patchFilesForWebContainer` is used by the MODAL
  // preview path (patch-sandbox-preview-files.ts) and `fixHtmlEntry` by the
  // DEPLOY path (lib/deploy/build-project.ts). Removing it breaks both.
  // DEFAULT ON (free engine): WebContainer runs entirely in the visitor's
  // browser — npm install and the dev server execute on their machine, so
  // framework previews cost the platform nothing. Modal still takes priority
  // whenever it is configured (sandboxEnabled wins in the engine picker).
  // Set NEXT_PUBLIC_PREVIEW_WEBCONTAINER=0 to disable the explicit fallback.
  const flag = process.env.NEXT_PUBLIC_PREVIEW_WEBCONTAINER;
  return flag !== "0" && flag !== "false";
}

/** True when the project looks like a Vite/Node app (legacy WC eligibility). */
export function shouldUseWebContainer(files: Pick<ProjectFile, "path">[]): boolean {
  if (files.length === 0) return false;
  const paths = files
    .map((f) => (typeof f.path === "string" ? f.path.replace(/\\/g, "/") : ""))
    .filter(Boolean);
  const hasPackageJson = paths.some((p) => p === "package.json" || p.endsWith("/package.json"));
  const hasVite = paths.some((p) => /vite\.config\.(t|j)sx?$/.test(p));
  const hasNodeEntry =
    paths.some((p) => /^src\/(main|index)\.tsx?$/.test(p)) ||
    paths.includes("src/App.tsx") ||
    paths.includes("src/App.jsx");
  return hasPackageJson && (hasVite || hasNodeEntry);
}

/**
 * Product preview engine = server sandbox first, explicit WebContainer fallback.
 *
 * - Docker/server sandbox configured, booting, or live → `"sandbox"`
 * - Server sandbox missing → `"unavailable"` unless WebContainer is explicitly allowed.
 * - WebContainer requires the caller opt-in plus browser isolation.
 */
export function resolvePreviewEngine(
  files: Pick<ProjectFile, "path">[],
  opts?: {
    preferWebContainers?: boolean;
    crossOriginIsolated?: boolean;
    /** Live server-sandbox URL — highest fidelity. */
    sandboxUrl?: string | null;
    /** Server sandbox configured / booting — stay there before the URL arrives. */
    sandboxEnabled?: boolean;
    /** Explicit opt-in for the single browser fallback. */
    allowWebContainer?: boolean;
  },
): Exclude<PreviewEngine, "detecting"> {
  // Server execution always wins when available or booting.
  if (opts?.sandboxUrl || opts?.sandboxEnabled) {
    return "sandbox";
  }

  return "unavailable";
}
