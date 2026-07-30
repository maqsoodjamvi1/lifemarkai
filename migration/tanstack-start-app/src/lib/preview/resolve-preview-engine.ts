import type { ProjectFile } from "@/types/database";

export type PreviewEngine = "detecting" | "sandbox" | "webcontainer" | "fallback";

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
  const flag = process.env.NEXT_PUBLIC_PREVIEW_WEBCONTAINER;
  return flag === "1" || flag === "true";
}

/** True when the project looks like a Vite/Node app (legacy WC eligibility). */
export function shouldUseWebContainer(files: Pick<ProjectFile, "path">[]): boolean {
  if (files.length === 0) return false;
  const paths = files.map((f) => f.path.replace(/\\/g, "/"));
  const hasPackageJson = paths.some((p) => p === "package.json" || p.endsWith("/package.json"));
  const hasVite = paths.some((p) => /vite\.config\.(t|j)sx?$/.test(p));
  const hasNodeEntry =
    paths.some((p) => /^src\/(main|index)\.tsx?$/.test(p)) ||
    paths.includes("src/App.tsx") ||
    paths.includes("src/App.jsx");
  return hasPackageJson && (hasVite || hasNodeEntry);
}

/**
 * Product preview engine = Modal sandbox only (Lovable).
 *
 * - Modal configured / booting / live → `"sandbox"`
 * - Modal missing → `"fallback"` which the panel treats as **Modal required**
 *   (not WebContainer, not esbuild, not E2B, not a fake srcdoc product).
 * - WebContainer only when `NEXT_PUBLIC_PREVIEW_WEBCONTAINER=1` (draft).
 */
export function resolvePreviewEngine(
  files: Pick<ProjectFile, "path">[],
  opts?: {
    preferWebContainers?: boolean;
    crossOriginIsolated?: boolean;
    /** Live Modal tunnel URL — highest fidelity. */
    sandboxUrl?: string | null;
    /** Modal configured / booting — stay on sandbox even before URL arrives. */
    sandboxEnabled?: boolean;
    /** Explicit opt-in for draft WebContainer path. */
    allowWebContainer?: boolean;
  },
): Exclude<PreviewEngine, "detecting"> {
  // Lovable product path — Modal always wins when available or booting.
  if (opts?.sandboxUrl || opts?.sandboxEnabled) {
    return "sandbox";
  }

  // Draft WebContainer — never the default product path.
  const allowWc =
    opts?.allowWebContainer === true && isWebContainerPreviewEnabled();
  const prefer = opts?.preferWebContainers === true;
  const isolated = opts?.crossOriginIsolated ?? false;

  if (
    typeof window !== "undefined" &&
    window.sessionStorage.getItem(WC_UNAVAILABLE_KEY) === "1"
  ) {
    return "fallback";
  }

  if (allowWc && prefer && isolated && shouldUseWebContainer(files)) {
    return "webcontainer";
  }

  // Modal not configured → panel shows "Configure Modal" (not WC/esbuild/E2B).
  return "fallback";
}
