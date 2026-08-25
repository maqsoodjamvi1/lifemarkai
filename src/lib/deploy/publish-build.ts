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
import { tryViteBuild, looksLikeViteProject, type BuildFile } from "./build-project.ts";
import { storeBuild, normaliseBuildPath } from "./build-store.ts";
import { buildDeployIndexHtml } from "./build-deploy-files.ts";
import { rerootClientBuild } from "./tss-publish.ts";
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

/** TanStack Start and other SSR Vite apps often emit assets without a root index.html. */
function ensureBuildEntryDocument(
  output: BuildFile[],
  sourceFiles: BuildFile[],
  projectId: string,
  onLog?: (line: string) => void,
): BuildFile[] {
  if (output.some((f) => normaliseBuildPath(f.path) === "index.html")) return output;

  const nested = output.find((f) => {
    const path = normaliseBuildPath(f.path);
    return path && path.endsWith("/index.html");
  });
  if (nested) {
    onLog?.(`[publish] hoisting ${nested.path} → index.html`);
    return [
      { path: "index.html", content: nested.content, encoding: nested.encoding },
      ...output.filter((f) => f !== nested),
    ];
  }

  onLog?.("[publish] bundling project sources into index.html");
  return [
    { path: "index.html", content: buildDeployIndexHtml(sourceFiles, { projectId }) },
    ...output,
  ];
}

function bundledViteFallback(files: BuildFile[], projectId: string): BuildFile[] {
  return [{ path: "index.html", content: buildDeployIndexHtml(files, { projectId }) }];
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
      const buildDisabled = process.env.ENABLE_SERVER_VITE_BUILD !== "true";
      onLog?.(
        buildDisabled
          ? "[publish] ENABLE_SERVER_VITE_BUILD is not 'true' — publishing bundled static entry"
          : "[publish] vite build produced no dist/ — publishing bundled static entry",
      );
      output = bundledViteFallback(files, projectId);
      compiled = false;
    }
  } else if (isPlainStaticSite(files)) {
    onLog?.("[publish] static site — no compile step needed");
    output = flattenStatic(files);
  } else {
    // TanStack Start ships vite.config + src/routes but no index.html — still deployable.
    const hasViteConfig = files.some((f) =>
      /^vite\.config\.(t|j)sx?$/.test(f.path.replace(/\\/g, "/")),
    );
    if (hasViteConfig) {
      onLog?.("[publish] Vite app without index.html — publishing bundled static entry");
      output = bundledViteFallback(files, projectId);
    } else {
      const detail =
        "project is neither a Vite app nor a static site with index.html — nothing to publish";
      onLog?.(`[publish] ${detail}`);
      recordEvent("deployment_failed", { reason: "unpublishable_project", durationMs: Date.now() - publishStartedAt });
      return { ok: false, buildId: null, fileCount: 0, detail, compiled: false };
    }
  }

  // TSS SPA-mode builds land under dist/client/ — re-root the client dir
  // (and drop server output) so asset references survive. Falls through to
  // the hoist/bundle repair for any other layout.
  const rerooted = rerootClientBuild(output);
  if (rerooted) {
    onLog?.("[publish] re-rooted client/ build output");
    output = rerooted;
  }
  output = ensureBuildEntryDocument(output, files, projectId, onLog);

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
