/**
 * WebContainer preview engine — runs the generated app IN THE BROWSER.
 *
 * WHY: zero server cost. Modal/E2B bill per sandbox-hour; WebContainer runs on
 * the end user's own machine, so previews are effectively unlimited. It is the
 * fallback when a sandbox provider is unavailable (e.g. spend limit reached).
 *
 * HARD CONSTRAINTS — read before changing anything here:
 *
 *  1. ONE INSTANCE PER PAGE, EVER. `WebContainer.boot()` may be called only
 *     once per page load; a second call throws. Hence the module-level
 *     singleton + in-flight promise. Do not "just boot another one" for a
 *     second project — tear the files down and re-mount instead.
 *  2. REQUIRES CROSS-ORIGIN ISOLATION. It needs SharedArrayBuffer, which
 *     browsers gate behind COOP/COEP. vite.config.ts sets those headers only
 *     when NEXT_PUBLIC_PREVIEW_WEBCONTAINER=1. Without isolation, boot() fails
 *     with an opaque error, so we check up front and say so plainly.
 *  3. NODE ONLY. No Python, no native binaries, no real database. Vite/Node
 *     projects only — anything else belongs on Modal/E2B.
 *  4. CHROMIUM-FIRST. We serve COEP `credentialless`, which Safari does not
 *     support.
 */

import { normalizeProjectImports } from "./normalize-imports.ts";
import { ensureTypecheckToolchain } from "./ensure-toolchain.ts";
import { patchFilesForWebContainer } from "./patch-vite-for-webcontainer.ts";

export interface WcFile {
  path: string;
  content?: string | null;
}

/**
 * Run the project through the same file-prep steps the sandbox provider gets
 * (patch-sandbox-preview-files.ts's patchSandboxPreviewFiles) before handing
 * it to WebContainer — trimmed to the subset that's both relevant here and
 * safe to run IN THE BROWSER (no TLS-tunnel/Supabase-env/route-tree steps,
 * which are either sandbox-specific or read server-only env).
 *
 * Before this, files went into WebContainer completely raw. Two concrete
 * failure modes that fixes elsewhere in this codebase, but only for the
 * sandbox path:
 *   - normalizeProjectImports repairs a broken import specifier BEFORE it
 *     reaches the bundler — push-to-sandbox.ts's own docs describe the
 *     unrepaired version as "the WORST moment for a bad specifier": it
 *     freezes the dev server mid-build with "Failed to resolve import".
 *   - ensureTypecheckToolchain re-adds `typescript`/`@types/react(-dom)` to
 *     package.json when the model's rewrite dropped them — without it,
 *     `npm install` reconciles node_modules DOWN to package.json and prunes
 *     out the compiler, so `tsc` (and anything depending on it) 404s.
 *   - patchFilesForWebContainer is the WebContainer-specific vite.config /
 *     index.html / VEB-bridge patcher this file's sibling module exists to
 *     provide — it was never actually being called from here.
 */
export function prepareFilesForWebContainer(files: WcFile[]): WcFile[] {
  return patchFilesForWebContainer(ensureTypecheckToolchain(normalizeProjectImports(files)));
}

export interface WcBootResult {
  ok: boolean;
  /** Origin the dev server is listening on, once `server-ready` fires. */
  url?: string;
  error?: string;
}

export interface WcRunOptions {
  files: WcFile[];
  /** Defaults to `npm run dev` when the project has that script. */
  startCommand?: { cmd: string; args: string[] };
  /** Streamed install/dev output — wire this to the preview log UI. */
  onOutput?: (chunk: string) => void;
  /** Same phase vocabulary the Modal/E2B providers emit. */
  onProgress?: (phase: string, detail?: string) => void;
}

/** WebContainer's nested mount format. */
type FsTree = Record<string, { file: { contents: string } } | { directory: FsTree }>;

/**
 * Convert our flat `[{path, content}]` list into WebContainer's nested tree.
 *
 * `src/components/Header.tsx` becomes
 *   { src: { directory: { components: { directory: { "Header.tsx": {file:{contents}} } } } } }
 */
export function filesToFsTree(files: WcFile[]): FsTree {
  const root: FsTree = {};
  for (const f of files) {
    const clean = f.path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!clean) continue;
    const segments = clean.split("/").filter(Boolean);
    const fileName = segments.pop();
    if (!fileName) continue;

    let cursor = root;
    for (const seg of segments) {
      const existing = cursor[seg];
      if (!existing || !("directory" in existing)) {
        cursor[seg] = { directory: {} };
      }
      cursor = (cursor[seg] as { directory: FsTree }).directory;
    }
    cursor[fileName] = { file: { contents: f.content ?? "" } };
  }
  return root;
}

/** Boot is once-per-page; keep the instance and the in-flight promise. */
let wcInstance: any = null;
let wcBooting: Promise<any> | null = null;
/** Set when boot fails so we stop retrying a hopeless environment. */
let wcFatal: string | null = null;
/**
 * The currently-running dev-server process (from the last successful
 * runProjectInWebContainer call), if any. Every call used to spawn a new
 * "npm run dev" without checking for one already running — restarting the
 * runtime (the UI's own "Restart runtime" action on a boot error) or
 * switching projects while on this engine left the previous dev server
 * running inside the WebContainer indefinitely, accumulating CPU/memory in
 * the browser tab for as long as it stayed open.
 */
let wcDevProcess: any = null;
/**
 * The package.json content `npm install` last succeeded against, in THIS
 * page session. Every call ran `npm install` unconditionally — for a project
 * where only application code changed (the overwhelming majority of edits),
 * that repeats a multi-second dependency-resolution pass against an
 * identical dependency graph, on every restart AND on every edit-triggered
 * remount. WebContainer is a page-lifetime singleton, so `node_modules` from
 * a prior install is still sitting in its virtual FS; skip the reinstall
 * when package.json is byte-identical to what's already installed.
 */
let wcLastInstalledPackageJson: string | null = null;

function packageJsonContent(files: WcFile[]): string | null {
  const pkg = files.find(
    (f) => f.path.replace(/\\/g, "/").replace(/^\/+/, "") === "package.json",
  );
  return pkg?.content ?? null;
}

export function isCrossOriginIsolated(): boolean {
  return typeof window !== "undefined" && window.crossOriginIsolated === true;
}

/** Human-readable reason WebContainer can't run here, or null if it can. */
export function webContainerBlocker(): string | null {
  if (typeof window === "undefined") return "WebContainer is browser-only.";
  if (typeof SharedArrayBuffer === "undefined" || !isCrossOriginIsolated()) {
    return (
      "This page is not cross-origin isolated, so SharedArrayBuffer is unavailable. " +
      "Restart the dev server after a config change. WebContainer needs Chromium " +
      "(COOP/COEP). Set NEXT_PUBLIC_PREVIEW_WEBCONTAINER=0 to disable this engine."
    );
  }
  if (wcFatal) return wcFatal;
  return null;
}

/**
 * Clear a remembered `WebContainer.boot()` failure so the next call actually
 * retries instead of replaying the cached error.
 *
 * `wcFatal` exists to stop hammering a genuinely hopeless environment (no
 * cross-origin isolation, which `webContainerBlocker` already reports
 * separately and unconditionally), but `getWebContainer` also sets it for
 * ordinary transient boot failures — a one-off StackBlitz-runtime hiccup,
 * for instance — and never clears it itself. Before this, the editor's own
 * "Restart runtime" button called back into `webContainerBlocker`, saw the
 * stale `wcFatal` string, and returned immediately without ever calling
 * `WebContainer.boot()` again: the button visibly did nothing, for the rest
 * of the page session, for every project opened afterward too. Call this
 * right before the explicit user-initiated retry (never automatically —
 * only a person choosing to retry should pay for another boot attempt).
 */
export function resetWebContainerFatal(): void {
  wcFatal = null;
}

/**
 * Boot (or reuse) the singleton. The dynamic import keeps @webcontainer/api out
 * of the main bundle — it is large and only needed when this engine is used.
 */
export async function getWebContainer(): Promise<any> {
  if (wcInstance) return wcInstance;
  if (wcBooting) return wcBooting;

  const blocker = webContainerBlocker();
  if (blocker) throw new Error(blocker);

  wcBooting = (async () => {
    const mod = await import(/* @vite-ignore */ "@webcontainer/api");
    const WebContainer = (mod as any).WebContainer;
    if (!WebContainer?.boot) {
      throw new Error("@webcontainer/api loaded but WebContainer.boot is missing.");
    }
    const instance = await WebContainer.boot();
    wcInstance = instance;
    return instance;
  })();

  try {
    return await wcBooting;
  } catch (err) {
    // Remember the failure: booting again in the same page will not help, and
    // repeated attempts produce confusing cascading errors.
    wcFatal = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    wcBooting = null;
  }
}

/** Does package.json declare the script we intend to run? */
function hasDevScript(files: WcFile[]): boolean {
  const pkg = files.find(
    (f) => f.path.replace(/\\/g, "/").replace(/^\/+/, "") === "package.json",
  );
  if (!pkg?.content) return false;
  try {
    return Boolean(JSON.parse(pkg.content)?.scripts?.dev);
  } catch {
    return false;
  }
}

/** Keeps only the last `max` characters of streamed output, for error messages. */
class TailBuffer {
  private buf = "";
  constructor(private readonly max = 4000) {}
  push(chunk: string): void {
    this.buf = (this.buf + chunk).slice(-this.max);
  }
  toString(): string {
    return this.buf.trim();
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Run `npm install` once, capturing its tail output for error reporting.
 * Time-boxed (unlike before, where a hung install spun the "installing"
 * phase forever with no user-visible failure — unlike the dev-server wait
 * just below, which already had a timeout).
 */
async function runNpmInstallOnce(
  wc: any,
  output: (chunk: string) => void,
  tail: TailBuffer,
): Promise<{ ok: boolean; error?: string }> {
  const install: any = await withTimeout<any>(
    wc.spawn("npm", ["install", "--prefer-offline", "--no-audit", "--no-fund"]),
    180_000,
    "npm install did not start within 180s.",
  );
  void install.output.pipeTo(
    new WritableStream({
      write: (chunk: string) => {
        tail.push(chunk);
        output(chunk);
      },
    }),
  );
  const installCode: number = await withTimeout<number>(
    install.exit,
    180_000,
    "npm install did not finish within 180s.",
  );
  if (installCode !== 0) {
    return {
      ok: false,
      error: `npm install failed (exit ${installCode}).${tail.toString() ? `\n${tail.toString()}` : ""}`,
    };
  }
  return { ok: true };
}

/**
 * `npm install`, with ONE retry on failure. WebContainer's install goes
 * through a virtual npm registry proxy running in the browser tab — a
 * one-off network hiccup (more common here than on a real, supported CI
 * machine) previously killed the whole boot outright with no second chance.
 * A genuine dependency-resolution error fails identically on retry, so the
 * only cost of retrying unconditionally is one extra attempt in the
 * already-rare failure case.
 */
async function runNpmInstallWithRetry(
  wc: any,
  progress: (phase: string, detail?: string) => void,
  output: (chunk: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  const tail = new TailBuffer();
  const first = await runNpmInstallOnce(wc, output, tail);
  if (first.ok) return first;

  progress("installing", "Install failed — retrying once…");
  tail.push("\n--- retrying npm install ---\n");
  return runNpmInstallOnce(wc, output, tail);
}

/**
 * Mount the project, install dependencies, start the dev server, and resolve
 * with the preview URL once the server actually reports ready.
 *
 * Resolving on `server-ready` (rather than after spawn) matters: Vite prints
 * its banner before it accepts connections, so returning earlier hands the
 * iframe a URL that refuses the connection — the same class of bug that made
 * the Modal preview look broken when `getHost()` returned too soon.
 */
/**
 * Serializes calls into the mount→install→spawn pipeline below, which has no
 * reentrancy guard of its own — unlike getWebContainer()'s wcBooting lock,
 * which only serializes the ONE-TIME WebContainer.boot() call. Two
 * overlapping calls here (both using the already-booted singleton) can both
 * proceed to mount/install/spawn concurrently: `wcDevProcess` is written
 * unconditionally at the end of each, so `killWcDevProcess()` in a second
 * call can run in parallel with the first call's `mount` — long before
 * either reaches `spawn` — meaning neither kills the other's future
 * process, leaking a dev server. Worse, `wc.on("server-ready", ...)` is
 * registered per call but the event fires once per WebContainer instance,
 * so whichever spawned process reports ready FIRST resolves BOTH pending
 * calls — the "current" (non-superseded) caller can resolve with the URL of
 * the stale, orphaned dev server instead of the one actually serving its
 * files. Concretely reachable during initial AI generation, where
 * `files.length` changes on every streamed file and preview-panel.tsx's
 * boot effect re-fires while the previous call is still mid-install; also
 * reachable by double-clicking "Restart runtime". Chaining every call onto
 * the last one — rather than dropping overlapping calls — keeps every
 * requested run honored (the caller for project state N+1 still gets run,
 * just after N's pipeline has fully finished touching the shared instance).
 */
let wcRunChain: Promise<unknown> = Promise.resolve();

export function runProjectInWebContainer(opts: WcRunOptions): Promise<WcBootResult> {
  const run = wcRunChain.then(() => runProjectInWebContainerInner(opts));
  // Swallow here so one call's rejection doesn't poison the chain for
  // whichever call is queued after it — each call's own returned promise
  // still rejects normally for ITS caller.
  wcRunChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function runProjectInWebContainerInner(
  opts: WcRunOptions,
): Promise<WcBootResult> {
  const progress = opts.onProgress ?? (() => {});
  const output = opts.onOutput ?? (() => {});

  const files = prepareFilesForWebContainer(opts.files);

  try {
    progress("creating", "Starting in-browser runtime");
    const wc = await getWebContainer();

    // Kill any dev server left running from a previous call (a restart, or a
    // fresh run after switching projects) before starting a new one — the
    // WebContainer instance is a page-lifetime singleton, so an unkilled
    // process just keeps running underneath the new one. Independent of the
    // mount below (neither touches the other), so run them together instead
    // of paying two sequential round-trips.
    await Promise.all([
      killWcDevProcess(),
      (async () => {
        progress("writing", `Mounting ${files.length} files`);
        await wc.mount(filesToFsTree(files));
      })(),
    ]);

    // Surface the URL the moment the dev server is up. `.on()` returns an
    // unsubscribe function — captured and called once this settles so a
    // restart doesn't keep stacking new listeners onto the shared singleton
    // forever (each one previously outlived this call indefinitely).
    let unsubReady: (() => void) | undefined;
    let unsubError: (() => void) | undefined;
    const serverReady = new Promise<string>((resolve, reject) => {
      unsubReady = wc.on("server-ready", (_port: number, url: string) => resolve(url));
      unsubError = wc.on("error", (e: { message?: string }) =>
        reject(new Error(e?.message || "WebContainer error")),
      );
    });

    const pkgContent = packageJsonContent(files);
    if (pkgContent !== null && pkgContent === wcLastInstalledPackageJson) {
      // Same dependency graph already installed in this page session — the
      // WebContainer instance is a singleton, so node_modules from the last
      // install is still there. Skipping this saves the multi-second
      // resolve+fetch+link pass on the overwhelming majority of restarts,
      // where only application code (not package.json) changed.
      progress("installing", "Dependencies unchanged — skipping install");
    } else {
      progress("installing", "Installing dependencies");
      const installResult = await runNpmInstallWithRetry(wc, progress, output);
      if (!installResult.ok) {
        unsubReady?.();
        unsubError?.();
        return { ok: false, error: installResult.error };
      }
      wcLastInstalledPackageJson = pkgContent;
    }

    const start =
      opts.startCommand ??
      (hasDevScript(files)
        ? { cmd: "npm", args: ["run", "dev"] }
        : // No dev script: run Vite directly rather than failing outright.
          { cmd: "npx", args: ["vite", "--port", "5173"] });

    progress("starting", `${start.cmd} ${start.args.join(" ")}`);
    const dev = await wc.spawn(start.cmd, start.args);
    wcDevProcess = dev;
    void dev.output.pipeTo(
      new WritableStream({ write: (chunk: string) => output(chunk) }),
    );

    try {
      // Don't wait forever — a project that never binds a port should report
      // a real error instead of spinning indefinitely.
      const url = await Promise.race([
        serverReady,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Dev server did not become ready within 90s.")),
            90_000,
          ),
        ),
      ]);

      progress("ready");
      return { ok: true, url };
    } finally {
      unsubReady?.();
      unsubError?.();
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Kill the tracked dev-server process, if one is running. Best-effort. */
async function killWcDevProcess(): Promise<void> {
  const proc = wcDevProcess;
  wcDevProcess = null;
  if (!proc) return;
  try {
    proc.kill();
  } catch {
    // Process may already have exited — nothing to clean up.
  }
}

/**
 * Swap the mounted project without re-booting (boot is once-per-page) — used
 * for a live edit while the dev server is already running, so Vite's own
 * file watcher/HMR picks up the change instead of a full restart.
 *
 * Previously this ONLY mounted — it never re-ran `npm install`, so an edit
 * that added a new dependency to package.json was silently never installed;
 * the preview just kept running against stale node_modules indefinitely with
 * no error. Now it detects that case (comparing against the same
 * wcLastInstalledPackageJson tracked by runProjectInWebContainer) and
 * installs before reporting success — still skipping the install entirely,
 * as before, on the far more common case of an edit that didn't touch
 * dependencies.
 */
export async function remountProject(opts: WcRunOptions): Promise<WcBootResult> {
  if (!wcInstance) return runProjectInWebContainer(opts);

  const files = prepareFilesForWebContainer(opts.files);
  const progress = opts.onProgress ?? (() => {});
  const output = opts.onOutput ?? (() => {});

  try {
    await wcInstance.mount(filesToFsTree(files));

    const pkgContent = packageJsonContent(files);
    if (pkgContent !== null && pkgContent !== wcLastInstalledPackageJson) {
      progress("installing", "package.json changed — installing new dependencies");
      const installResult = await runNpmInstallWithRetry(wcInstance, progress, output);
      if (!installResult.ok) return { ok: false, error: installResult.error };
      wcLastInstalledPackageJson = pkgContent;
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
