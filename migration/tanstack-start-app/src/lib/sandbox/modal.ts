/**
 * Modal Sandboxes — Lovable.dev's production preview backend.
 * Per-project named sandbox, npm install, Vite/Next dev server, TLS tunnel URL.
 *
 * Uses Modal filesystem API (writeText/writeBytes) when available for fast sync;
 * falls back to shell base64 writes on older SDKs.
 */
import type {
  ClaudeCodeResult,
  CommandResult,
  SandboxFile,
  SandboxProvider,
  SandboxRunResult,
} from "./index";
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  detectSandboxStart,
  sandboxNameForProject,
  trunc,
  waitForServer,
} from "./shared";
import { BASE_APP_DEPENDENCIES, BASE_APP_DEV_DEPENDENCIES } from "@/lib/preview/base-app-deps";

const WORKDIR = "/workspace";
const WRITE_CONCURRENCY = 8;

export type ModalBootPhase =
  | "creating"
  | "writing"
  | "installing"
  | "starting"
  | "ready"
  | "error";

type ModalFilesystem = {
  writeText?: (text: string, remotePath: string) => Promise<void>;
  writeBytes?: (data: Uint8Array | Buffer, remotePath: string) => Promise<void>;
  makeDirectory?: (remotePath: string) => Promise<void>;
};

type ModalSandbox = {
  sandboxId: string;
  filesystem?: ModalFilesystem;
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

type ModalImage = {
  dockerfileCommands: (commands: string[], params?: Record<string, unknown>) => ModalImage;
  build: (app: unknown) => Promise<ModalImage>;
};

type ModalClient = {
  apps: {
    fromName: (name: string, opts?: { createIfMissing?: boolean }) => Promise<unknown>;
  };
  images: {
    fromRegistry: (image: string) => ModalImage;
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

function toWorkspacePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\//, "");
  return `${WORKDIR}/${normalized}`;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

function detectInstallCommand(files: SandboxFile[]): string {
  const paths = files.map((f) => f.path.replace(/\\/g, "/"));
  if (paths.some((p) => p.endsWith("pnpm-lock.yaml") || p === "pnpm-lock.yaml")) {
    return "npm install -g pnpm@9 && pnpm install --frozen-lockfile=false";
  }
  if (paths.some((p) => /(^|\/)yarn\.lock$/.test(p))) {
    return "corepack enable && yarn install";
  }
  return "npm install";
}

export class ModalSandboxProvider implements SandboxProvider {
  readonly id = "modal" as const;

  private appName = process.env.MODAL_APP_NAME || "lifemark-preview";
  private imageRef = process.env.MODAL_SANDBOX_IMAGE || "node:20-bookworm";

  isEnabled(): boolean {
    return Boolean(process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET);
  }

  /**
   * Pre-bake the default app dependency set into the preview image so a cold
   * sandbox's `npm install` only resolves the app's deltas (near-instant),
   * matching Lovable's warm-image speed. Off by setting MODAL_SANDBOX_PREBAKE=0.
   */
  private prebakeEnabled(): boolean {
    const v = process.env.MODAL_SANDBOX_PREBAKE;
    return v === undefined || v === "" ? true : v === "1" || v.toLowerCase() === "true";
  }

  /** Base package.json (shared with the scaffold) as base64 for a Dockerfile RUN. */
  private basePackageJsonB64(): string {
    const pkg = JSON.stringify({
      name: "lifemark-preview-base",
      private: true,
      type: "module",
      dependencies: BASE_APP_DEPENDENCIES,
      devDependencies: BASE_APP_DEV_DEPENDENCIES,
    });
    return Buffer.from(pkg, "utf8").toString("base64");
  }

  /**
   * The preview image. With prebake on, adds a cached layer that installs the
   * base deps into /workspace/node_modules at build time (package.json kept so
   * a superset app install doesn't prune the baked modules).
   */
  private previewImage(modal: ModalClient): ModalImage {
    const base = modal.images.fromRegistry(this.imageRef);
    if (!this.prebakeEnabled()) return base;
    const b64 = this.basePackageJsonB64();
    return base.dockerfileCommands([
      "RUN mkdir -p /workspace",
      "WORKDIR /workspace",
      `RUN echo '${b64}' | base64 -d > package.json && npm install --no-audit --no-fund --loglevel=error && npm cache clean --force`,
    ]);
  }

  /**
   * Resolve the image to boot from — the pre-baked image when enabled, but if
   * its build fails for any reason, fall back to the plain base image so a bake
   * problem can NEVER break previews.
   */
  private async resolveImage(modal: ModalClient, app: unknown): Promise<ModalImage> {
    if (!this.prebakeEnabled()) return modal.images.fromRegistry(this.imageRef);
    try {
      return await this.previewImage(modal).build(app);
    } catch {
      return modal.images.fromRegistry(this.imageRef);
    }
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

  /** Prefer Modal filesystem API; fall back to shell base64 for older SDKs. */
  private async writeFile(sb: ModalSandbox, filePath: string, content: string): Promise<void> {
    const target = toWorkspacePath(filePath);
    const fsApi = sb.filesystem;

    if (fsApi?.writeText) {
      try {
        await fsApi.writeText(content, target);
        return;
      } catch {
        /* fall through to shell */
      }
    }
    if (fsApi?.writeBytes) {
      try {
        await fsApi.writeBytes(Buffer.from(content, "utf8"), target);
        return;
      } catch {
        /* fall through */
      }
    }

    const normalized = filePath.replace(/\\/g, "/").replace(/^\//, "");
    const dir = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    if (dir) {
      await this.execProcess(sb, ["mkdir", "-p", dir]);
    }
    const b64 = Buffer.from(content, "utf8").toString("base64");
    // Chunk large files to stay under argv limits.
    if (b64.length > 60_000) {
      const tmp = `${target}.b64`;
      await this.execProcess(sb, ["bash", "-c", `: > ${shellSingleQuote(tmp)}`]);
      for (let i = 0; i < b64.length; i += 48_000) {
        await this.execProcess(sb, [
          "bash",
          "-c",
          `printf %s ${shellSingleQuote(b64.slice(i, i + 48_000))} >> ${shellSingleQuote(tmp)}`,
        ]);
      }
      await this.execProcess(sb, [
        "bash",
        "-c",
        `base64 -d ${shellSingleQuote(tmp)} > ${shellSingleQuote(target)} && rm -f ${shellSingleQuote(tmp)}`,
      ]);
      return;
    }
    await this.execProcess(sb, [
      "bash",
      "-c",
      `echo ${shellSingleQuote(b64)} | base64 -d > ${shellSingleQuote(target)}`,
    ]);
  }

  private async writeAllFiles(sb: ModalSandbox, files: SandboxFile[]): Promise<void> {
    await this.execProcess(sb, ["mkdir", "-p", WORKDIR]);
    await mapPool(files, WRITE_CONCURRENCY, async (f) => {
      await this.writeFile(sb, f.path, f.content);
    });
  }

  private async installDeps(sb: ModalSandbox, files: SandboxFile[]): Promise<string> {
    if (!files.some((f) => f.path.replace(/\\/g, "/").endsWith("package.json"))) {
      return "";
    }
    const installCmd = detectInstallCommand(files);
    const install = await this.execProcess(sb, ["bash", "-c", installCmd]);
    return install.stdout + install.stderr;
  }

  private async startDevServer(sb: ModalSandbox, startCommand: string, port: number): Promise<void> {
    await this.execProcess(sb, [
      "bash",
      "-c",
      `nohup ${startCommand} > /tmp/lifemark-dev.log 2>&1 &`,
    ]);

    // Probe from INSIDE the sandbox. The Lifemark host (esp. Docker Desktop)
    // often cannot hairpin to `*.w.modal.host` — TCP connects then resets —
    // so waiting on the public tunnel URL falsely reports "Dev server did not
    // start" even when Vite is healthy. Users' browsers can still load the
    // tunnel; only the server-side hairpin is broken.
    const ready = await this.waitForLocalPort(sb, port, 120_000);
    if (!ready) {
      const tail = await this.execProcess(sb, ["bash", "-c", "tail -n 60 /tmp/lifemark-dev.log 2>/dev/null || true"]);
      throw new Error(`Dev server did not start on port ${port}. ${trunc(tail.stdout + tail.stderr, 800)}`);
    }
  }

  /** Poll `127.0.0.1:<port>` inside the sandbox until the app answers. */
  private async waitForLocalPort(
    sb: ModalSandbox,
    port: number,
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const probe = await this.execProcess(sb, [
        "bash",
        "-c",
        // Prefer curl; fall back to node. Treat any HTTP response (incl. 404)
        // as up — only connection-refused / empty means not listening yet.
        `code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:${port}/ 2>/dev/null || true); ` +
          `if [ -n "$code" ] && [ "$code" != "000" ]; then echo UP:$code; exit 0; fi; ` +
          `node -e "fetch('http://127.0.0.1:${port}/',{signal:AbortSignal.timeout(3000)}).then(r=>{console.log('UP:'+r.status);process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null || true`,
      ]);
      if (/UP:\d+/.test(probe.stdout || "")) return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  }

  async runProject(opts: {
    files: SandboxFile[];
    template?: string;
    port?: number;
    startCommand?: string;
    timeoutMs?: number;
    projectId?: string;
    onProgress?: (phase: ModalBootPhase, detail?: string) => void;
  }): Promise<SandboxRunResult> {
    if (!this.isEnabled()) {
      return { ok: false, error: "Modal not configured (set MODAL_TOKEN_ID + MODAL_TOKEN_SECRET)." };
    }

    const detected = detectSandboxStart(opts.files);
    const port = opts.port ?? detected.port;
    const startCommand = opts.startCommand ?? detected.startCommand;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const progress = opts.onProgress;

    try {
      const modal = await this.client();
      const app = await this.getApp(modal);

      if (opts.projectId) {
        const name = sandboxNameForProject(opts.projectId);
        try {
          const warm = await modal.sandboxes.fromName(this.appName, name);
          if (await this.waitForLocalPort(warm, port, 8000)) {
            const previewUrl = await this.previewUrlFromSandbox(warm, port);
            progress?.("ready", "Reconnected to warm Modal sandbox");
            return { ok: true, sandboxId: warm.sandboxId, previewUrl, logs: "Reconnected to warm Modal sandbox" };
          }
          await warm.terminate().catch(() => {});
        } catch {
          /* cold start below */
        }
      }

      progress?.("creating", "Provisioning Modal sandbox");
      const image = await this.resolveImage(modal, app);
      // Keep the sandbox's entrypoint alive for the WHOLE lifetime — a fixed
      // `sleep 7200` (2h) used to terminate the container before the wall-clock
      // deadline, killing long previews. Sleep for the full timeout window (+a
      // small margin) so only the Modal timeout/idle policy governs teardown.
      const keepAliveSecs = Math.ceil(timeoutMs / 1000) + 60;
      const createOpts: Record<string, unknown> = {
        encryptedPorts: [port],
        timeoutMs,
        idleTimeoutMs: Math.min(DEFAULT_IDLE_TIMEOUT_MS, timeoutMs),
        workdir: WORKDIR,
        command: ["sleep", String(keepAliveSecs)],
      };
      if (opts.projectId) {
        createOpts.name = sandboxNameForProject(opts.projectId);
      }

      let sb;
      try {
        sb = await modal.sandboxes.create(app, image, createOpts);
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : String(createErr);
        // Race: warm lookup missed an existing named sandbox — reclaim it.
        // Important: a Modal name can outlive the container. fromName() then
        // succeeds but tunnels/exec throw NOT_FOUND ("Sandbox has already shut
        // down"). That must NOT abort the cold boot — terminate + recreate.
        if (opts.projectId && /already exists/i.test(msg)) {
          const name = sandboxNameForProject(opts.projectId);
          try {
            const existing = await modal.sandboxes.fromName(this.appName, name);
            try {
              if (await this.waitForLocalPort(existing, port, 12_000)) {
                const previewUrl = await this.previewUrlFromSandbox(existing, port);
                progress?.("ready", "Reconnected to existing Modal sandbox");
                return {
                  ok: true,
                  sandboxId: existing.sandboxId,
                  previewUrl,
                  logs: "Reconnected after name conflict",
                };
              }
            } catch (reclaimErr) {
              const reclaimMsg =
                reclaimErr instanceof Error ? reclaimErr.message : String(reclaimErr);
              if (
                !/already shut down|NOT_FOUND|Sandbox .*not found|container ID .*not found/i.test(
                  reclaimMsg,
                )
              ) {
                throw reclaimErr;
              }
              console.warn(
                `[modal] named sandbox ${name} is gone during reclaim — terminating stale name`,
              );
            }
            await existing.terminate().catch(() => {});
          } catch {
            /* name may already be gone */
          }
          sb = await modal.sandboxes.create(app, image, createOpts);
        } else if (/timeout|duration|limit|exceed|too (large|long)|invalid/i.test(msg)) {
          // Defensive: if the plan/API rejects the long (24h) lifetime, don't
          // break previews — retry once with a conservative 2h cap so the
          // sandbox still comes up (just shorter-lived).
          const cappedMs = 2 * 60 * 60 * 1000;
          const cappedOpts = {
            ...createOpts,
            timeoutMs: cappedMs,
            idleTimeoutMs: cappedMs,
            command: ["sleep", String(Math.ceil(cappedMs / 1000) + 60)],
          };
          sb = await modal.sandboxes.create(app, image, cappedOpts);
          progress?.("creating", "Provisioned with a 2h cap (plan limit on lifetime)");
        } else {
          throw createErr;
        }
      }

      progress?.("writing", `Writing ${opts.files.length} files`);
      await this.writeAllFiles(sb, opts.files);

      progress?.("installing", "Installing dependencies");
      const logs = await this.installDeps(sb, opts.files);

      progress?.("starting", `Starting ${startCommand}`);
      await this.startDevServer(sb, startCommand, port);
      const previewUrl = await this.previewUrlFromSandbox(sb, port);

      progress?.("ready", previewUrl);
      return {
        ok: true,
        sandboxId: sb.sandboxId,
        previewUrl,
        logs: trunc(logs),
      };
    } catch (err) {
      progress?.("error", err instanceof Error ? err.message : String(err));
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async runClaudeCode(): Promise<ClaudeCodeResult> {
    return { ok: false, error: "Claude Code in Modal sandbox is not implemented yet." };
  }

  async exec(sandboxId: string, command: string): Promise<CommandResult> {
    const sb = await this.connect(sandboxId);
    return this.execProcess(sb, ["bash", "-c", command]);
  }

  async writeFiles(sandboxId: string, files: SandboxFile[]): Promise<void> {
    const sb = await this.connect(sandboxId);
    await mapPool(files, WRITE_CONCURRENCY, async (f) => {
      await this.writeFile(sb, f.path, f.content);
    });
  }

  async getPreviewUrl(sandboxId: string, port?: number): Promise<string> {
    const sb = await this.connect(sandboxId);
    const resolvedPort = port ?? Number(process.env.MODAL_PREVIEW_PORT ?? 5173);
    return this.previewUrlFromSandbox(sb, resolvedPort);
  }

  async getDevLogs(sandboxId: string, lines = 80): Promise<string> {
    const n = Math.min(200, Math.max(10, lines));
    const result = await this.exec(
      sandboxId,
      `tail -n ${n} /tmp/lifemark-dev.log 2>/dev/null || echo "(no Modal dev log yet)"`,
    );
    return trunc((result.stdout || result.stderr || "").trim(), 12_000);
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
      // Zombie named sandbox (tunnel URL but Vite never came up) — free the name
      // so the next cold POST can provision a fresh Modal sandbox.
      await warm.terminate().catch(() => {});
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

  /**
   * Reset the sandbox's idle/wall-clock timer so it doesn't expire while the
   * user is actively editing. Any RPC to the sandbox resets Modal's idle timer;
   * we also push the wall-clock deadline via setTimeout when the SDK exposes it.
   * Cheap (a no-op exec) and fail-soft — a dead sandbox just reports alive:false
   * so the caller can trigger a reconnect.
   */
  async keepAlive(
    sandboxId: string,
    opts?: { previewUrl?: string; port?: number },
  ): Promise<{ alive: boolean; tunnelHealthy?: boolean; restarted?: boolean }> {
    try {
      const sb = await this.connect(sandboxId);
      // Push the wall-clock deadline forward when supported (SDK-version safe).
      const withTimeout = sb as unknown as { setTimeout?: (ms: number) => Promise<void> | void };
      if (typeof withTimeout.setTimeout === "function") {
        try {
          await withTimeout.setTimeout(DEFAULT_TIMEOUT_MS);
        } catch {
          /* older SDK — the exec below still resets the idle timer */
        }
      }
      // A lightweight command resets Modal's idle timer AND proves the container
      // (compute) is alive.
      await this.execProcess(sb, ["true"]);

      // ── Zombie-tunnel detection + self-heal ────────────────────────────────
      // Modal can keep the CONTAINER alive while the Vite dev server inside it
      // dies (OOM, crash, reclaim of the tunnel). The tunnel then resets
      // connections (ERR_CONNECTION_RESET) even though phase stays "ready" and a
      // no-op exec still succeeds — so `alive:true` alone is NOT enough, and the
      // client never reboots, leaving the user stuck on a dead preview that the
      // UI mislabels "Preview root is empty — app crashed during mount". Probe
      // the actual tunnel HTTP; if it's dead while compute is alive, restart
      // Vite in place and re-probe.
      const port = opts?.port ?? Number(process.env.MODAL_PREVIEW_PORT ?? 5173);
      let previewUrl = opts?.previewUrl;
      if (!previewUrl) {
        try {
          previewUrl = await this.previewUrlFromSandbox(sb, port);
        } catch {
          /* can't resolve — skip the tunnel probe, compute is still alive */
        }
      }
      if (!previewUrl) return { alive: true };

      if (await waitForServer(previewUrl, 6000)) {
        return { alive: true, tunnelHealthy: true };
      }

      // Dead tunnel + live compute → restart the dev server in place.
      await this.execProcess(sb, [
        "bash",
        "-c",
        `(pkill -f vite || true); sleep 1; cd ${WORKDIR} && nohup npm run dev -- --host 0.0.0.0 --port ${port} >> /tmp/lifemark-dev.log 2>&1 &`,
      ]);
      const recovered = await waitForServer(previewUrl, 15_000);
      return { alive: true, tunnelHealthy: recovered, restarted: true };
    } catch {
      return { alive: false };
    }
  }
}
