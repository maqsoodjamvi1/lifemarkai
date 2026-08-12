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

export interface WcFile {
  path: string;
  content?: string | null;
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

export function isCrossOriginIsolated(): boolean {
  return typeof window !== "undefined" && window.crossOriginIsolated === true;
}

/** Human-readable reason WebContainer can't run here, or null if it can. */
export function webContainerBlocker(): string | null {
  if (typeof window === "undefined") return "WebContainer is browser-only.";
  if (typeof SharedArrayBuffer === "undefined" || !isCrossOriginIsolated()) {
    return (
      "This page is not cross-origin isolated, so SharedArrayBuffer is unavailable. " +
      "Set NEXT_PUBLIC_PREVIEW_WEBCONTAINER=1 and restart the dev server (vite.config " +
      "only sends the COOP/COEP headers when that flag is on)."
    );
  }
  if (wcFatal) return wcFatal;
  return null;
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

/**
 * Mount the project, install dependencies, start the dev server, and resolve
 * with the preview URL once the server actually reports ready.
 *
 * Resolving on `server-ready` (rather than after spawn) matters: Vite prints
 * its banner before it accepts connections, so returning earlier hands the
 * iframe a URL that refuses the connection — the same class of bug that made
 * the Modal preview look broken when `getHost()` returned too soon.
 */
export async function runProjectInWebContainer(
  opts: WcRunOptions,
): Promise<WcBootResult> {
  const progress = opts.onProgress ?? (() => {});
  const output = opts.onOutput ?? (() => {});

  try {
    progress("creating", "Starting in-browser runtime");
    const wc = await getWebContainer();

    progress("writing", `Mounting ${opts.files.length} files`);
    await wc.mount(filesToFsTree(opts.files));

    // Surface the URL the moment the dev server is up.
    const serverReady = new Promise<string>((resolve, reject) => {
      wc.on("server-ready", (_port: number, url: string) => resolve(url));
      wc.on("error", (e: { message?: string }) =>
        reject(new Error(e?.message || "WebContainer error")),
      );
    });

    progress("installing", "Installing dependencies");
    const install = await wc.spawn("npm", ["install"]);
    void install.output.pipeTo(
      new WritableStream({ write: (chunk: string) => output(chunk) }),
    );
    const installCode = await install.exit;
    if (installCode !== 0) {
      return { ok: false, error: `npm install failed (exit ${installCode}).` };
    }

    const start =
      opts.startCommand ??
      (hasDevScript(opts.files)
        ? { cmd: "npm", args: ["run", "dev"] }
        : // No dev script: run Vite directly rather than failing outright.
          { cmd: "npx", args: ["vite", "--port", "5173"] });

    progress("starting", `${start.cmd} ${start.args.join(" ")}`);
    const dev = await wc.spawn(start.cmd, start.args);
    void dev.output.pipeTo(
      new WritableStream({ write: (chunk: string) => output(chunk) }),
    );

    // Don't wait forever — a project that never binds a port should report a
    // real error instead of spinning indefinitely.
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
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Swap the mounted project without re-booting (boot is once-per-page).
 * Returns the new preview URL.
 */
export async function remountProject(opts: WcRunOptions): Promise<WcBootResult> {
  if (!wcInstance) return runProjectInWebContainer(opts);
  try {
    await wcInstance.mount(filesToFsTree(opts.files));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
