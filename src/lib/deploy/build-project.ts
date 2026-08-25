/**
 * Server-side production build for deploys (Phase 4 — preview == deploy).
 *
 * Takes a generated project's files, runs a REAL `vite build` in a temp dir, and
 * returns the built `dist/` files. This replaces the static-CDN-index.html demo
 * the deploy worker ships today with an actual production bundle.
 *
 * Opt-in + fail-safe by design:
 *   • Gated behind ENABLE_SERVER_VITE_BUILD=true (npm install + build is heavy).
 *   • Returns null on ANY failure (missing npm, non-Vite project, build error,
 *     timeout) so the caller falls back to the existing static deploy. A deploy
 *     must never hard-fail because the build path is unavailable.
 *
 * Node-only (uses child_process/fs). Call from the deploy worker / route handler,
 * never from the browser bundle.
 */

import { spawn } from "child_process";
import { ensureTssSpaPublishHook } from "./tss-publish.ts";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { fixHtmlEntry } from "../preview/patch-vite-for-webcontainer.ts";
import { isTextAsset } from "./asset-kind.ts";

// Same Vite entry candidates the preview repair uses, so a deploy build doesn't
// die on a mis-pointed index.html entry script (e.g. /src/main.ts vs .tsx).
const BUILD_ENTRY_CANDIDATES = [
  "src/main.tsx", "src/main.jsx", "src/main.ts", "src/main.js",
  "src/index.tsx", "src/index.jsx",
];

export interface BuildFile {
  path: string;
  content: string;
  /**
   * How `content` is encoded. Absent means utf8, so existing callers that only
   * ever handled text keep working unchanged.
   */
  encoding?: "utf8" | "base64";
}

/** True when the project looks like a buildable Vite app. */
export function looksLikeViteProject(files: BuildFile[]): boolean {
  const paths = files.map((f) => f.path.replace(/\\/g, "/"));
  const hasPkg = paths.some((p) => p === "package.json");
  const hasViteConfig = paths.some((p) => /^vite\.config\.(t|j)sx?$/.test(p));
  const hasIndexHtml = paths.includes("index.html");
  return hasPkg && (hasViteConfig || hasIndexHtml);
}

/** Run a command with a hard timeout; resolves { code } and streams to onLog. */
function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  onLog?: (line: string) => void,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: process.platform === "win32", // npm/npx are .cmd shims on Windows
      env: {
        ...process.env,
        // The app container runs with NODE_ENV=production, which makes
        // `npm install` silently omit devDependencies — and generated projects
        // keep vite (and every build plugin) in devDependencies. npx then
        // fetched a bare vite whose rollup native binary was never installed:
        // "Cannot find module '@rollup/rollup-linux-x64-gnu'". A publish build
        // is a dev-tooling run, so force a dev install.
        NODE_ENV: "development",
        // TanStack Start projects publish as SPA builds (static hosting has no
        // Node server) — their vite configs read this. See tss-publish.ts.
        LM_PUBLISH_SPA: "1",
        CI: "1",
        npm_config_audit: "false",
        npm_config_fund: "false",
      },
    });
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore timeout cleanup errors; the process is already being torn down
      }
      onLog?.(`[build] '${cmd} ${args.join(" ")}' timed out after ${timeoutMs}ms`);
      resolve(124);
    }, timeoutMs);

    child.stdout?.on("data", (d) => onLog?.(String(d).trimEnd()));
    child.stderr?.on("data", (d) => onLog?.(String(d).trimEnd()));
    child.on("error", (err) => { clearTimeout(timer); onLog?.(`[build] spawn error: ${err.message}`); resolve(1); });
    child.on("close", (code) => { clearTimeout(timer); resolve(code ?? 1); });
  });
}

/** Recursively read every file under `dir`, returning paths relative to `dir`. */
async function readDirRecursive(dir: string, base = dir): Promise<BuildFile[]> {
  const out: BuildFile[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await readDirRecursive(full, base)));
    } else {
      const rel = path.relative(base, full).replace(/\\/g, "/");
      // Binaries must NOT be read as utf-8.
      //
      // The previous comment here reasoned that generated apps "rarely ship
      // binaries — images come from URLs", and read everything as utf-8. But
      // `vite build` emits a favicon, and any project that imports an image or a
      // font gets one in dist/ regardless of what the source looked like.
      // `readFile(png, "utf-8")` does not throw: it returns a string with every
      // invalid byte sequence replaced by U+FFFD. The asset then stores, serves
      // and renders as a broken image, with nothing logged anywhere. Decide by
      // extension and base64 anything that is not known to be text.
      if (isTextAsset(rel)) {
        out.push({ path: rel, content: await fs.readFile(full, "utf-8"), encoding: "utf8" });
      } else {
        const buf = await fs.readFile(full);
        out.push({ path: rel, content: buf.toString("base64"), encoding: "base64" });
      }
    }
  }
  return out;
}

/**
 * Attempt a real `vite build`. Returns the dist/ files, or null to fall back.
 */
export async function tryViteBuild(
  files: BuildFile[],
  onLog?: (line: string) => void,
): Promise<BuildFile[] | null> {
  if (process.env.ENABLE_SERVER_VITE_BUILD !== "true") return null;
  if (!looksLikeViteProject(files)) {
    onLog?.("[build] not a Vite project — using static deploy");
    return null;
  }

  let tmp: string | null = null;
  try {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "lifemark-build-"));

    // Resolve the real Vite entry so a mis-pointed index.html can be repaired.
    const allPaths = new Set(files.map((f) => f.path.replace(/\\/g, "/").replace(/^\/+/, "")));
    const entry = BUILD_ENTRY_CANDIDATES.find((c) => allPaths.has(c)) ?? null;

    // Write all project files into the temp dir
    for (const f of files) {
      const rel = f.path.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!rel) continue;
      let content = f.content ?? "";
      if (/^(public\/)?index\.html$/.test(rel)) content = fixHtmlEntry(content, entry);
      // Legacy TSS configs (generated before the scaffold shipped the hook)
      // get the LM_PUBLISH_SPA switch injected here, in the temp copy only.
      if (/^vite\.config\.(t|j)sx?$/.test(rel)) content = ensureTssSpaPublishHook(content);
      const dest = path.join(tmp, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, content, "utf-8");
    }

    const hasLock = files.some((f) => f.path === "package-lock.json");
    onLog?.("[build] installing dependencies…");
    const installCode = await run(
      "npm",
      hasLock ? ["ci", "--no-audit", "--no-fund"] : ["install", "--no-audit", "--no-fund"],
      tmp,
      180_000,
      onLog,
    );
    if (installCode !== 0) {
      onLog?.(`[build] npm install failed (code ${installCode}) — using static deploy`);
      return null;
    }

    onLog?.("[build] running vite build…");
    const buildCode = await run("npx", ["vite", "build"], tmp, 180_000, onLog);
    if (buildCode !== 0) {
      onLog?.(`[build] vite build failed (code ${buildCode}) — using static deploy`);
      return null;
    }

    const distDir = path.join(tmp, "dist");
    try {
      await fs.access(distDir);
    } catch {
      onLog?.("[build] no dist/ produced — using static deploy");
      return null;
    }

    const dist = await readDirRecursive(distDir);
    if (dist.length === 0) {
      onLog?.("[build] dist/ empty — using static deploy");
      return null;
    }
    onLog?.(`[build] built ${dist.length} file(s) — deploying real production bundle`);
    return dist;
  } catch (err) {
    onLog?.(`[build] error: ${err instanceof Error ? err.message : String(err)} — using static deploy`);
    return null;
  } finally {
    if (tmp) {
      fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }
}
