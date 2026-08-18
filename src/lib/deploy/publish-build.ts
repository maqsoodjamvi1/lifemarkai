/**
 * Turn a project's source into a served, public build.
 *
 * This is the step that was missing. `provider: "lifemarkai"` previously did:
 *
 *     await new Promise((r) => setTimeout(r, 2500));
 *     deployedUrl = lifemarkUrl();
 *
 * — a 2.5 second sleep and a URL. No build, no files, nothing to serve. Every
 * such URL pointed at a host that answered 503. This module runs a real
 * `vite build`, stores the output (migration 160) and returns the URL that will
 * actually serve it.
 *
 * Server-only: spawns npm/npx and uses the service-role client.
 */
import { randomUUID } from "crypto";
import { tryViteBuild,looksLikeViteProject,type BuildFile } from "./build-project.ts";
import { storeBuild } from "./build-store.ts";
import { recordEvent } from "../observability/events.ts";
import { setCorrelation } from "../observability/correlation.ts";

export interface PublishBuildResult {
  ok: boolean;
  buildId: string | null;
  fileCount: number;
  /** Human-readable reason, shown in deploy logs. Always set on failure. */
  detail: string;
  /** True when a real `vite build` ran, false when static files were copied. */
  compiled: boolean;
}

/**
 * A project with an index.html and no build step is already deployable — a
 * plain static site needs copying, not compiling. Detected separately from
 * `looksLikeViteProject` so a static project is not reported as a build failure.
 */
function isPlainStaticSite(files: BuildFile[]): boolean {
  const paths = files.map((f) => f.path.replace(/\\/g, "/"));
  const hasIndex = paths.includes("index.html") || paths.includes("public/index.html");
  const needsCompile = paths.some((p) => /^src\/.+\.(tsx?|jsx)$/.test(p));
  return hasIndex && !needsCompile;
}

/** Move `public/index.html` to the root so the served entry is where we look. */
function flattenStatic(files: BuildFile[]): BuildFile[] {
  const hasRootIndex = files.some((f) => f.path === "index.html");
  if (hasRootIndex) return files;
  return files.map((f) =>
    f.path === "public/index.html" ? { ...f, path: "index.html" } : f,
  );
}

export async function publishBuild(
  projectId: string,
  files: BuildFile[],
  onLog?: (line: string) => void,
): Promise<PublishBuildResult> {
  const buildId = randomUUID();
  // Phase 1: the deploy attempt gets a correlation id so its events join the
  // build that triggered it. The stored buildId doubles as the deploymentId.
  setCorrelation({ deploymentId: `dep_${buildId}`, projectId });
  const publishStartedAt = Date.now();

  if (!files.length) {
    recordEvent("deployment_failed", { reason: "no_files", durationMs: Date.now() - publishStartedAt });
    return { ok: false, buildId: null, fileCount: 0, detail: "project has no files", compiled: false };
  }

  let output: BuildFile[] | null = null;
  let compiled = false;

  if (looksLikeViteProject(files)) {
    onLog?.("[publish] compiling with vite…");
    output = await tryViteBuild(files, onLog);
    compiled = Boolean(output);
    if (!output) {
      // Be explicit about WHY, because the two causes need opposite responses:
      // a disabled flag is a config change, a failing build is a code fix.
      const reason =
        process.env.ENABLE_SERVER_VITE_BUILD !== "true"
          ? "ENABLE_SERVER_VITE_BUILD is not 'true' — the server will not compile this project"
          : "vite build failed — see the build log above";
      onLog?.(`[publish] ${reason}`);
      recordEvent("deployment_failed", { reason: "vite_build_failed", durationMs: Date.now() - publishStartedAt });
    return { ok: false, buildId: null, fileCount: 0, detail: reason, compiled: false };
    }
  } else if (isPlainStaticSite(files)) {
    onLog?.("[publish] static site — no compile step needed");
    output = flattenStatic(files);
  } else {
    const detail =
      "project is neither a Vite app nor a static site with index.html — nothing to publish";
    onLog?.(`[publish] ${detail}`);
    recordEvent("deployment_failed", { reason: "unpublishable_project", durationMs: Date.now() - publishStartedAt });
    return { ok: false, buildId: null, fileCount: 0, detail, compiled: false };
  }

  const stored = await storeBuild(projectId, buildId, output);
  if (!stored.ok) {
    onLog?.(`[publish] could not store build: ${stored.error}`);
    recordEvent("deployment_failed", { reason: "store_failed", durationMs: Date.now() - publishStartedAt });
    return { ok: false, buildId: null, fileCount: 0, detail: stored.error, compiled };
  }

  onLog?.(`[publish] stored ${stored.fileCount} file(s) as build ${buildId}`);
  recordEvent("deployment_completed", {
    fileCount: stored.fileCount,
    compiled,
    durationMs: Date.now() - publishStartedAt,
  });
  return {
    ok: true,
    buildId,
    fileCount: stored.fileCount,
    detail: compiled ? "compiled and published" : "published static files",
    compiled,
  };
}
