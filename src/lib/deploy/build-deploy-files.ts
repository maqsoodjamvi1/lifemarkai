import { getBadgeHtml } from "../badge.ts";
import { injectLifemarkDataSdk } from "../preview/lifemark-data.ts";
import { buildFallbackHtml } from "../preview/build-fallback-html.ts";
import type { ProjectFile } from "../../types/database.ts";

export type DeployFile = { path: string; content: string };

export type DeployBuildOpts = {
  projectId?: string;
  projectName?: string;
  badgeHidden?: boolean;
  referralCode?: string | null;
  /** Published app slug — enables the hosted LifemarkData backend. */
  appSlug?: string | null;
  /** LifemarkAI origin serving /api/public/app-data (defaults to APP_URL env). */
  appDataBase?: string | null;
};

function appDataBaseUrl(opts: DeployBuildOpts): string | null {
  return (
    opts.appDataBase ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    null
  );
}

function injectBadge(html: string, badgeHtml: string): string {
  if (!badgeHtml) return html;
  return html.includes("</body>") ? html.replace("</body>", `${badgeHtml}\n</body>`) : `${html}\n${badgeHtml}`;
}

function isStaticHtmlProject(files: DeployFile[]): boolean {
  const index = files.find((f) => f.path === "index.html" || f.path === "/index.html");
  return !!(
    index?.content &&
    !index.content.includes("src/main.tsx") &&
    !index.content.includes('type="module"')
  );
}

function isSourceFile(path: string): boolean {
  return /\.(tsx?|jsx?)$/.test(path) && !/\.d\.ts$/.test(path);
}

function toProjectFiles(files: DeployFile[], projectId: string): ProjectFile[] {
  return files.map((f, i) => ({
    id: String(i),
    project_id: projectId,
    path: f.path.replace(/^\//, ""),
    content: f.content,
    language: "tsx",
    created_at: "",
    updated_at: "",
  }));
}

/** Build a self-contained index.html using the same engine as the in-editor preview. */
export function buildDeployIndexHtml(files: DeployFile[], opts: DeployBuildOpts): string {
  const badgeHtml = getBadgeHtml(opts.projectId, opts.badgeHidden ?? false, opts.referralCode ?? null);

  if (isStaticHtmlProject(files)) {
    const index = files.find((f) => f.path === "index.html" || f.path === "/index.html")!;
    const withData = injectLifemarkDataSdk(index.content, {
      slug: opts.appSlug ?? null,
      apiBase: appDataBaseUrl(opts),
    });
    return injectBadge(withData, badgeHtml);
  }

  const html = buildFallbackHtml(toProjectFiles(files, opts.projectId ?? "deploy"));
  return injectBadge(html, badgeHtml);
}

/** Netlify static deploy — bundle React sources into index.html, keep assets. */
export function buildNetlifyFileMap(files: DeployFile[], opts: DeployBuildOpts): Record<string, string> {
  const map: Record<string, string> = {};
  const badgeHtml = getBadgeHtml(opts.projectId, opts.badgeHidden ?? false, opts.referralCode ?? null);

  for (const f of files) {
    const normalised = f.path.startsWith("/") ? f.path : `/${f.path}`;
    if (isSourceFile(normalised)) continue;
    if (normalised === "/index.html") continue;
    map[normalised] =
      normalised.endsWith(".html") && badgeHtml
        ? injectBadge(f.content ?? "", badgeHtml)
        : (f.content ?? "");
  }

  map["/index.html"] = buildDeployIndexHtml(files, opts);
  return map;
}

/** Overlay a real vite build's hashed assets onto a source-derived Netlify map. */
export function mergeViteBuildAssets(
  fileMap: Record<string, string>,
  built: DeployFile[],
): Record<string, string> {
  const merged = { ...fileMap };
  for (const f of built) {
    const key = f.path.startsWith("/") ? f.path : `/${f.path.replace(/^\/+/, "")}`;
    if (key !== "/index.html") merged[key] = f.content;
  }
  return merged;
}

/** Vercel static deploy file list. */
export function buildVercelFilesList(
  files: DeployFile[],
  opts: DeployBuildOpts,
): Array<{ file: string; data: string; encoding: "utf-8" }> {
  const badgeHtml = getBadgeHtml(opts.projectId, opts.badgeHidden ?? false, opts.referralCode ?? null);
  const list: Array<{ file: string; data: string; encoding: "utf-8" }> = [];

  for (const f of files) {
    const file = f.path.startsWith("/") ? f.path.slice(1) : f.path;
    if (isSourceFile(file)) continue;
    if (file === "index.html") continue;
    list.push({
      file,
      data: file.endsWith(".html") && badgeHtml ? injectBadge(f.content, badgeHtml) : f.content,
      encoding: "utf-8",
    });
  }

  list.push({
    file: "index.html",
    data: buildDeployIndexHtml(files, opts),
    encoding: "utf-8",
  });

  return list;
}
