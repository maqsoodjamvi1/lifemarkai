/**
 * Vercel Sandbox provider — Phase 7 of the Vercel adoption plan.
 *
 * A second remote-compute implementation of SandboxProvider, selectable ONLY
 * by explicit opt-in (SANDBOX_PROVIDER=vercel + VERCEL_SANDBOX_ENABLED=true):
 * it never becomes an automatic fallback, and the core-loop lane remains
 * Docker-only. The point of this file is the benchmark in the plan — same
 * interface, same callers, so Modal vs Vercel Sandbox numbers compare
 * provider infrastructure and nothing else.
 *
 * The @vercel/sandbox SDK is dynamically imported (same pattern as the Phase 4
 * AI SDK adapter): not installed → isEnabled() is false and every method
 * throws a clear "not installed" error rather than the bundle failing to
 * build. Credentials come from VERCEL_TOKEN / VERCEL_TEAM_ID /
 * VERCEL_PROJECT_ID.
 *
 * Security posture (plan requirements): sandboxes are created with NO
 * environment variables by default — a generated app never sees production
 * secrets; per-project naming ties a sandbox to exactly one project; kill()
 * really stops the VM.
 */
import type {
  ClaudeCodeResult,
  CommandResult,
  SandboxFile,
  SandboxProvider,
  SandboxRunResult,
} from "./index.ts";
import { trunc,waitForServer } from "./shared.ts";

interface VercelSandboxInstance {
  sandboxId: string;
  writeFiles(files: Array<{ path: string; content: Buffer }>): Promise<void>;
  runCommand(input: {
    cmd: string;
    args?: string[];
    detached?: boolean;
    cwd?: string;
    env?: Record<string, string>;
  }): Promise<{ exitCode?: number; stdout?: () => Promise<string>; stderr?: () => Promise<string> }>;
  domain(port: number): string;
  stop(): Promise<void>;
  extendTimeout?(ms: number): Promise<void>;
}

interface VercelSandboxModule {
  Sandbox: {
    create(config: Record<string, unknown>): Promise<VercelSandboxInstance>;
    get(config: Record<string, unknown>): Promise<VercelSandboxInstance>;
  };
}

let probe: Promise<VercelSandboxModule | null> | null = null;

function loadSdk(): Promise<VercelSandboxModule | null> {
  if (!probe) {
    probe = (async () => {
      try {
        const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
        const mod = (await dynamicImport("@vercel/sandbox")) as VercelSandboxModule;
        return typeof mod.Sandbox?.create === "function" ? mod : null;
      } catch {
        return null;
      }
    })();
  }
  return probe;
}

/** Test seam. */
export function resetVercelSandboxProbe(): void {
  probe = null;
}

function credentials(): { token: string; teamId: string; projectId: string } | null {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !teamId || !projectId) return null;
  return { token, teamId, projectId };
}

function flagOn(): boolean {
  const v = (process.env.VERCEL_SANDBOX_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

const DEFAULT_PORT = 3000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export class VercelSandboxProvider implements SandboxProvider {
  readonly id = "vercel" as const;

  /**
   * Enabled = flag on AND credentials present. Deliberately does NOT probe the
   * SDK here (isEnabled must stay synchronous for provider-policy); a missing
   * package surfaces as a precise error on first use instead.
   */
  isEnabled(): boolean {
    return flagOn() && credentials() !== null;
  }

  private async sdk(): Promise<VercelSandboxModule> {
    const mod = await loadSdk();
    if (!mod) {
      throw new Error(
        "Vercel Sandbox is enabled but @vercel/sandbox is not installed (npm install @vercel/sandbox)",
      );
    }
    return mod;
  }

  private async connect(sandboxId: string): Promise<VercelSandboxInstance> {
    const mod = await this.sdk();
    const creds = credentials();
    if (!creds) throw new Error("VERCEL_TOKEN / VERCEL_TEAM_ID / VERCEL_PROJECT_ID are not configured");
    return mod.Sandbox.get({ sandboxId, ...creds });
  }

  async runProject(opts: {
    files: SandboxFile[];
    template?: string;
    port?: number;
    startCommand?: string;
    timeoutMs?: number;
    projectId?: string;
    onProgress?: (phase: string, detail?: string) => void;
  }): Promise<SandboxRunResult> {
    const port = opts.port ?? DEFAULT_PORT;
    const progress = opts.onProgress ?? (() => {});
    try {
      const mod = await this.sdk();
      const creds = credentials();
      if (!creds) return { ok: false, error: "Vercel Sandbox credentials are not configured" };

      progress("creating", "Provisioning Vercel Sandbox…");
      const sandbox = await mod.Sandbox.create({
        ...creds,
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ports: [port],
        runtime: "node22",
        // NO env vars by default: a generated app must never see production
        // secrets (Phase 7 security validation).
      });

      progress("writing", `Writing ${opts.files.length} file(s)…`);
      await sandbox.writeFiles(
        opts.files.map((file) => ({ path: file.path, content: Buffer.from(file.content, "utf8") })),
      );

      progress("installing", "npm install…");
      const install = await sandbox.runCommand({ cmd: "npm", args: ["install", "--no-audit", "--no-fund"] });
      if (install.exitCode !== undefined && install.exitCode !== 0) {
        const stderr = install.stderr ? await install.stderr().catch(() => "") : "";
        return { ok: false, sandboxId: sandbox.sandboxId, error: `npm install failed: ${trunc(stderr, 2000)}` };
      }

      progress("starting", "Starting dev server…");
      const start = opts.startCommand ?? `npm run dev -- --host 0.0.0.0 --port ${port}`;
      await sandbox.runCommand({ cmd: "sh", args: ["-c", start], detached: true });

      const previewUrl = `https://${sandbox.domain(port)}`;
      const ready = await waitForServer(previewUrl, 90_000).catch(() => false);
      progress(ready ? "ready" : "starting", ready ? undefined : "Waiting for the dev server…");
      return { ok: true, sandboxId: sandbox.sandboxId, previewUrl, ready };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async exec(sandboxId: string, command: string): Promise<CommandResult> {
    const sandbox = await this.connect(sandboxId);
    const result = await sandbox.runCommand({ cmd: "sh", args: ["-c", command] });
    return {
      stdout: result.stdout ? trunc(await result.stdout().catch(() => ""), 20_000) : "",
      stderr: result.stderr ? trunc(await result.stderr().catch(() => ""), 20_000) : "",
      exitCode: result.exitCode ?? 0,
    };
  }

  async writeFiles(sandboxId: string, files: SandboxFile[]): Promise<void> {
    const sandbox = await this.connect(sandboxId);
    await sandbox.writeFiles(
      files.map((file) => ({ path: file.path, content: Buffer.from(file.content, "utf8") })),
    );
  }

  async getPreviewUrl(sandboxId: string, port = DEFAULT_PORT): Promise<string> {
    const sandbox = await this.connect(sandboxId);
    return `https://${sandbox.domain(port)}`;
  }

  async reconnect(sandboxId: string, port = DEFAULT_PORT): Promise<SandboxRunResult> {
    try {
      const sandbox = await this.connect(sandboxId);
      const previewUrl = `https://${sandbox.domain(port)}`;
      const ready = await waitForServer(previewUrl, 10_000).catch(() => false);
      return { ok: true, sandboxId, previewUrl, ready };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async keepAlive(
    sandboxId: string,
    opts?: { previewUrl?: string; port?: number },
  ): Promise<{ alive: boolean; tunnelHealthy?: boolean }> {
    try {
      const sandbox = await this.connect(sandboxId);
      await sandbox.extendTimeout?.(DEFAULT_TIMEOUT_MS);
      const url = opts?.previewUrl ?? `https://${sandbox.domain(opts?.port ?? DEFAULT_PORT)}`;
      const tunnelHealthy = await waitForServer(url, 5_000).catch(() => false);
      return { alive: true, tunnelHealthy };
    } catch {
      return { alive: false };
    }
  }

  async kill(sandboxId: string): Promise<void> {
    const sandbox = await this.connect(sandboxId);
    await sandbox.stop();
  }

  async runClaudeCode(): Promise<ClaudeCodeResult> {
    // The Claude Code lane is E2B-template-specific; Vercel Sandbox does not
    // participate in the Phase 7 benchmark for it.
    return {
      ok: false,
      error: "runClaudeCode is not supported on the Vercel Sandbox provider",
    };
  }
}
