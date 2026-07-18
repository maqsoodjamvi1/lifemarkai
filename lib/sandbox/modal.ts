/**
 * Modal Sandboxes — Lovable.dev's production preview backend.
 * Per-project named sandbox, npm install, Vite/Next dev server, TLS tunnel URL.
 */
import type {
  ClaudeCodeResult,
  CommandResult,
  SandboxFile,
  SandboxProvider,
  SandboxRunResult,
} from "./index";
import {
  DEFAULT_TIMEOUT_MS,
  detectSandboxStart,
  sandboxNameForProject,
  trunc,
  waitForServer,
} from "./shared";

const WORKDIR = "/workspace";

type ModalSandbox = {
  sandboxId: string;
  exec: (
    cmd: string[],
    opts?: { stdout?: string; stderr?: string; workdir?: string },
  ) => Promise<{
    stdout: { readText: () => Promise<string> };
    stderr: { readText: () => Promise<string> };
    wait: () => Promise<number>;
  }>;
  tunnels: (timeoutMs?: number) => Promise<Record<number, { url: string; port: number }>>;
  terminate: () => Promise<void>;
};

type ModalClient = {
  apps: {
    fromName: (name: string, opts?: { createIfMissing?: boolean }) => Promise<unknown>;
  };
  images: {
    fromRegistry: (image: string) => unknown;
  };
  sandboxes: {
    create: (
      app: unknown,
      image: unknown,
      opts?: Record<string, unknown>,
    ) => Promise<ModalSandbox>;
    fromId: (id: string) => Promise<ModalSandbox>;
    fromName: (appName: string, name: string) => Promise<ModalSandbox>;
  };
};

async function loadModal(): Promise<{ ModalClient: new () => ModalClient } | null> {
  try {
    const mod = (await import("modal")) as { ModalClient?: new () => ModalClient };
    return mod?.ModalClient ? { ModalClient: mod.ModalClient } : null;
  } catch {
    return null;
  }
}

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export class ModalSandboxProvider implements SandboxProvider {
  readonly id = "modal" as const;

  private appName = process.env.MODAL_APP_NAME || "lifemark-preview";
  private imageRef = process.env.MODAL_SANDBOX_IMAGE || "node:20-bookworm";

  isEnabled(): boolean {
    return Boolean(process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET);
  }

  private async client(): Promise<ModalClient> {
    const loaded = await loadModal();
    if (!loaded) {
      throw new Error("Modal SDK not installed (npm install modal). Requires Node 22+.");
    }
    return new loaded.ModalClient();
  }

  private async getApp(modal: ModalClient) {
    return modal.apps.fromName(this.appName, { createIfMissing: true });
  }

  private async connect(sandboxId: string): Promise<ModalSandbox> {
    const modal = await this.client();
    return modal.sandboxes.fromId(sandboxId);
  }

  private async previewUrlFromSandbox(sb: ModalSandbox, port: number): Promise<string> {
    const tunnels = await sb.tunnels(120_000);
    const tunnel = tunnels[port];
    if (!tunnel?.url) throw new Error(`No tunnel for port ${port}`);
    return tunnel.url;
  }

  private async execProcess(
    sb: ModalSandbox,
    command: string[],
    workdir = WORKDIR,
  ): Promise<CommandResult> {
    const proc = await sb.exec(command, { stdout: "pipe", stderr: "pipe", workdir });
    const [stdout, stderr, exitCode] = await Promise.all([
      proc.stdout.readText(),
      proc.stderr.readText(),
      proc.wait(),
    ]);
    return { stdout, stderr, exitCode };
  }

  private async writeFile(sb: ModalSandbox, filePath: string, content: string): Promise<void> {
    const normalized = filePath.replace(/\\/g, "/").replace(/^\//, "");
    const dir = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    if (dir) {
      await this.execProcess(sb, ["mkdir", "-p", dir]);
    }
    const b64 = Buffer.from(content, "utf8").toString("base64");
    const target = `${WORKDIR}/${normalized}`;
    await this.execProcess(sb, [
      "bash",
      "-c",
      `echo ${shellSingleQuote(b64)} | base64 -d > ${shellSingleQuote(target)}`,
    ]);
  }

  private async writeAllFiles(sb: ModalSandbox, files: SandboxFile[]): Promise<string> {
    let logs = "";
    for (const f of files) {
      await this.writeFile(sb, f.path, f.content);
    }
    if (files.some((f) => f.path.replace(/\\/g, "/").endsWith("package.json"))) {
      const install = await this.execProcess(sb, ["npm", "install"]);
      logs += install.stdout + install.stderr;
    }
    return logs;
  }

  private async startDevServer(sb: ModalSandbox, startCommand: string, port: number): Promise<void> {
    await this.execProcess(sb, [
      "bash",
      "-c",
      `nohup ${startCommand} > /tmp/lifemark-dev.log 2>&1 &`,
    ]);
    const url = await this.previewUrlFromSandbox(sb, port);
    const ready = await waitForServer(url, 120_000);
    if (!ready) {
      const tail = await this.execProcess(sb, ["bash", "-c", "tail -n 40 /tmp/lifemark-dev.log 2>/dev/null || true"]);
      throw new Error(`Dev server did not start on port ${port}. ${trunc(tail.stdout + tail.stderr, 800)}`);
    }
  }

  async runProject(opts: {
    files: SandboxFile[];
    template?: string;
    port?: number;
    startCommand?: string;
    timeoutMs?: number;
    projectId?: string;
  }): Promise<SandboxRunResult> {
    if (!this.isEnabled()) {
      return { ok: false, error: "Modal not configured (set MODAL_TOKEN_ID + MODAL_TOKEN_SECRET)." };
    }

    const detected = detectSandboxStart(opts.files);
    const port = opts.port ?? detected.port;
    const startCommand = opts.startCommand ?? detected.startCommand;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      const modal = await this.client();
      const app = await this.getApp(modal);

      if (opts.projectId) {
        const name = sandboxNameForProject(opts.projectId);
        try {
          const warm = await modal.sandboxes.fromName(this.appName, name);
          const previewUrl = await this.previewUrlFromSandbox(warm, port);
          if (await waitForServer(previewUrl, 8000)) {
            return { ok: true, sandboxId: warm.sandboxId, previewUrl, logs: "Reconnected to warm Modal sandbox" };
          }
          await warm.terminate().catch(() => {});
        } catch {
          /* cold start below */
        }
      }

      const image = modal.images.fromRegistry(this.imageRef);
      const createOpts: Record<string, unknown> = {
        encryptedPorts: [port],
        timeoutMs,
        idleTimeoutMs: Math.min(timeoutMs, 20 * 60 * 1000),
        workdir: WORKDIR,
        command: ["sleep", "7200"],
      };
      if (opts.projectId) {
        createOpts.name = sandboxNameForProject(opts.projectId);
      }

      const sb = await modal.sandboxes.create(app, image, createOpts);
      const logs = await this.writeAllFiles(sb, opts.files);
      await this.startDevServer(sb, startCommand, port);
      const previewUrl = await this.previewUrlFromSandbox(sb, port);

      return {
        ok: true,
        sandboxId: sb.sandboxId,
        previewUrl,
        logs: trunc(logs),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async runClaudeCode(): Promise<ClaudeCodeResult> {
    return { ok: false, error: "Claude Code in Modal sandbox is not implemented yet (use E2B)." };
  }

  async exec(sandboxId: string, command: string): Promise<CommandResult> {
    const sb = await this.connect(sandboxId);
    return this.execProcess(sb, ["bash", "-c", command]);
  }

  async writeFiles(sandboxId: string, files: SandboxFile[]): Promise<void> {
    const sb = await this.connect(sandboxId);
    for (const f of files) {
      await this.writeFile(sb, f.path, f.content);
    }
  }

  async getPreviewUrl(sandboxId: string, port?: number): Promise<string> {
    const sb = await this.connect(sandboxId);
    const resolvedPort = port ?? Number(process.env.MODAL_PREVIEW_PORT ?? 5173);
    return this.previewUrlFromSandbox(sb, resolvedPort);
  }

  async reconnect(sandboxId: string, port?: number): Promise<SandboxRunResult> {
    if (!this.isEnabled()) {
      return { ok: false, error: "Modal not configured." };
    }
    try {
      const resolvedPort = port ?? Number(process.env.MODAL_PREVIEW_PORT ?? 5173);
      const previewUrl = await this.getPreviewUrl(sandboxId, resolvedPort);
      const alive = await waitForServer(previewUrl, 8000);
      if (!alive) {
        return { ok: false, error: "Sandbox not responding", sandboxId };
      }
      return { ok: true, sandboxId, previewUrl };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async reconnectByProject(projectId: string, port?: number): Promise<SandboxRunResult> {
    if (!this.isEnabled()) {
      return { ok: false, error: "Modal not configured." };
    }
    try {
      const modal = await this.client();
      const name = sandboxNameForProject(projectId);
      const warm = await modal.sandboxes.fromName(this.appName, name);
      const resolvedPort = port ?? Number(process.env.MODAL_PREVIEW_PORT ?? 5173);
      const previewUrl = await this.previewUrlFromSandbox(warm, resolvedPort);
      if (await waitForServer(previewUrl, 8000)) {
        return { ok: true, sandboxId: warm.sandboxId, previewUrl, logs: "Reconnected by project name" };
      }
      return { ok: false, error: "Named sandbox not responding", sandboxId: warm.sandboxId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async kill(sandboxId: string): Promise<void> {
    try {
      const sb = await this.connect(sandboxId);
      await sb.terminate();
    } catch {
      /* already gone */
    }
  }
}
