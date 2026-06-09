import type { ProjectFile } from "@/types/database";

export type PreviewEngine = "detecting" | "webcontainer" | "fallback";

/** True when the project looks like a Vite/Node app that benefits from WebContainers. */
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

export function resolvePreviewEngine(
  files: Pick<ProjectFile, "path">[],
  opts?: {
    preferWebContainers?: boolean;
    crossOriginIsolated?: boolean;
  },
): Exclude<PreviewEngine, "detecting"> {
  const prefer = opts?.preferWebContainers !== false;
  const isolated = opts?.crossOriginIsolated ?? false;
  if (prefer && isolated && shouldUseWebContainer(files)) {
    return "webcontainer";
  }
  return "fallback";
}
