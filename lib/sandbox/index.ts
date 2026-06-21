/**
 * Sandbox execution provider — run a generated app in a real isolated
 * environment and get a LIVE preview URL (Lovable-parity real execution).
 * See docs/titan/05-platform-business-layer.md §7.
 *
 * Pattern adapted from the Lovable-Clone reference (E2B cloud sandboxes):
 * create a sandbox, write the project files, start the dev server, and return
 * `https://<host>` from sandbox.getHost(port). This is real server-side
 * execution + a public preview URL — beyond the client-side WebContainer/srcdoc
 * preview LifemarkAI uses today.
 *
 * Design notes:
 * - Provider-agnostic interface so Docker / Firecracker can be added later.
 * - **Dependency-optional**: the E2B SDK (`@e2b/code-interpreter`) is imported
 *   via a guarded dynamic import so the module compiles and the app builds even
 *   when the SDK isn't installed. Install it + set E2B_API_KEY to enable;
 *   otherwise `isEnabled()` is false and callers fall back to the existing
 *   in-browser preview (same graceful-degradation pattern as the Netlify domain
 *   path and the domain registrar drivers).
 */

export interface SandboxFile {
  path: string;
  content: string;
}

export interface SandboxRunResult {
  ok: boolean;
  sandboxId?: string;
  /** Live, publicly reachable preview URL of the running app. */
  previewUrl?: string;
  /** stdout/stderr from the install/build/run step (truncated). */
  logs?: string;
  error?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode?: number;
}

export interface SandboxProvider {
  readonly id: "e2b" | "docker" | "firecracker";
  /** True when credentials/SDK are present. */
  isEnabled(): boolean;
  /**
   * Provision a sandbox from a template, write the files, install deps, start
   * the dev server, and return a live preview URL.
   */
  runProject(opts: {
    files: SandboxFile[];
    /** Template/image id (e.g. an E2B template). */
    template?: string;
    /** Port the dev server listens on (default 3000). */
    port?: number;
    /** Command to start the app (default: framework dev server). */
    startCommand?: string;
    /** Max sandbox lifetime in ms. */
    timeoutMs?: number;
  }): Promise<SandboxRunResult>;
  /** Run a shell command in an existing sandbox. */
  exec(sandboxId: string, command: string): Promise<CommandResult>;
  /** Write/update files in an existing sandbox (incremental edits). */
  writeFiles(sandboxId: string, files: SandboxFile[]): Promise<void>;
  /** Re-derive the live preview URL for a running sandbox. */
  getPreviewUrl(sandboxId: string, port?: number): Promise<string>;
  /** Tear down a sandbox. */
  kill(sandboxId: string): Promise<void>;
}

const DEFAULT_PORT = 3000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

/**
 * Load the E2B SDK only when present. The package name is assembled at runtime
 * so the bundler/TS doesn't hard-require the dependency to be installed.
 */
async function loadE2B(): Promise<{ Sandbox: any } | null> {
  try {
    const name = ["@e2b", "code-interpreter"].join("/");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import(/* webpackIgnore: true */ name as string)) as any;
    return mod?.Sandbox ? { Sandbox: mod.Sandbox } : null;
  } catch {
    return null;
  }
}

function trunc(s: string, n = 4000): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

class E2BSandboxProvider implements SandboxProvider {
  readonly id = "e2b" as const;
  private template = process.env.E2B_TEMPLATE || "base";

  isEnabled(): boolean {
    return Boolean(process.env.E2B_API_KEY);
  }

  async runProject(opts: {
    files: SandboxFile[];
    template?: string;
    port?: number;
    startCommand?: string;
    timeoutMs?: number;
  }): Promise<SandboxRunResult> {
    if (!this.isEnabled()) {
      return { ok: false, error: "E2B not configured (set E2B_API_KEY)." };
    }
    const e2b = await loadE2B();
    if (!e2b) {
      return { ok: false, error: "E2B SDK not installed (npm i @e2b/code-interpreter)." };
    }

    const port = opts.port ?? DEFAULT_PORT;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const sandbox = await e2b.Sandbox.create(opts.template ?? this.template);
      await sandbox.setTimeout(timeoutMs);

      for (const f of opts.files) {
        await sandbox.files.write(f.path, f.content);
      }

      let logs = "";
      // Install deps if a package.json is present.
      if (opts.files.some((f) => f.path.endsWith("package.json"))) {
        const install = await sandbox.commands.run("npm install", {
          onStdout: (d: string) => (logs += d),
          onStderr: (d: string) => (logs += d),
        });
        logs += install?.stdout ?? "";
      }

      // Start the dev server in the background (don't await — it's long-lived).
      const start = opts.startCommand ?? `npx next dev -p ${port}`;
      void sandbox.commands.run(start, { background: true }).catch(() => {});

      const host = await sandbox.getHost(port);
      return {
        ok: true,
        sandboxId: sandbox.sandboxId,
        previewUrl: `https://${host}`,
        logs: trunc(logs),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async connect(sandboxId: string): Promise<any> {
    const e2b = await loadE2B();
    if (!e2b) throw new Error("E2B SDK not installed.");
    const sandbox = await e2b.Sandbox.connect(sandboxId);
    await sandbox.setTimeout(DEFAULT_TIMEOUT_MS);
    return sandbox;
  }

  async exec(sandboxId: string, command: string): Promise<CommandResult> {
    const sandbox = await this.connect(sandboxId);
    const buffers = { stdout: "", stderr: "" };
    try {
      const res = await sandbox.commands.run(command, {
        onStdout: (d: string) => (buffers.stdout += d),
        onStderr: (d: string) => (buffers.stderr += d),
      });
      return { stdout: res?.stdout ?? buffers.stdout, stderr: buffers.stderr, exitCode: res?.exitCode };
    } catch (err) {
      return { stdout: buffers.stdout, stderr: `${buffers.stderr}\n${String(err)}`, exitCode: 1 };
    }
  }

  async writeFiles(sandboxId: string, files: SandboxFile[]): Promise<void> {
    const sandbox = await this.connect(sandboxId);
    for (const f of files) await sandbox.files.write(f.path, f.content);
  }

  async getPreviewUrl(sandboxId: string, port = DEFAULT_PORT): Promise<string> {
    const sandbox = await this.connect(sandboxId);
    return `https://${await sandbox.getHost(port)}`;
  }

  async kill(sandboxId: string): Promise<void> {
    try {
      const sandbox = await this.connect(sandboxId);
      await sandbox.kill();
    } catch {
      /* already gone */
    }
  }
}

let cached: SandboxProvider | null = null;

/** Get the configured sandbox provider (E2B today; Docker/Firecracker later). */
export function getSandboxProvider(): SandboxProvider {
  if (!cached) cached = new E2BSandboxProvider();
  return cached;
}

/** True when a real sandbox backend is available (else use in-browser preview). */
export function isSandboxEnabled(): boolean {
  return getSandboxProvider().isEnabled();
}
