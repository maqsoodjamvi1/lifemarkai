/**
 * Sandbox execution provider — run a generated app in a real isolated
 * environment and get a LIVE preview URL (Lovable-parity real execution).
 *
 * Production (Lovable): **Modal Sandboxes** only (`lib/sandbox/modal.ts`).
 *
 * Draft / legacy:
 * - **E2B** — opt-in via `SANDBOX_PROVIDER=e2b` or `ENABLE_E2B_SANDBOX=1`.
 *   Not auto-selected when Modal is missing.
 * - In-browser WebContainer / esbuild — gated in preview-panel / resolve-preview-engine.
 *
 * Design notes:
 * - Provider-agnostic interface so Docker / Firecracker can be added later.
 * - E2B SDK is dependency-optional (dynamic import).
 */

import type { TscDiagnostic } from "./tsc-diagnostics.ts";

export type { TscDiagnostic };

export interface SandboxFile {
  path: string;
  content: string;
}

export interface SandboxRunResult {
  ok: boolean;
  sandboxId?: string;
  /** Live, publicly reachable preview URL of the running app. */
  previewUrl?: string;
  /**
   * Did the dev server actually answer before we returned?
   *
   * `ok` means "the sandbox was provisioned" — it does NOT mean the app is
   * serving. Those two were conflated, so a boot whose dev server hadn't come
   * up yet still reported ready, the editor framed the URL, and the user got
   * Traefik's **502 Bad Gateway** inside the preview pane. Callers must treat
   * `ready === false` as "keep waiting", not as a failure: the container is
   * alive and its supervisor is still bringing the server up, so the phase
   * poller promotes it the moment the tunnel answers.
   *
   * Undefined from providers that don't report it — treat as ready.
   */
  ready?: boolean;
  /** stdout/stderr from the install/build/run step (truncated). */
  logs?: string;
  error?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode?: number;
}

/** Outcome of type-checking a project inside its own sandbox. */
export interface TypecheckResult {
  /**
   * Did the check actually run?
   *
   * False when the project has no local TypeScript — a legitimate state for a
   * plain-JS app, and NOT the same as "no errors". Callers must not read an
   * unavailable check as a clean bill of health.
   */
  available: boolean;
  /** Project-relative diagnostics, dependency noise already removed. */
  diagnostics: TscDiagnostic[];
  /** Wall time of the check, for deciding whether it is worth keeping. */
  durationMs?: number;
  /** The check was killed at its time limit; diagnostics are partial. */
  timedOut?: boolean;
  /** Why it could not run, when `available` is false. */
  reason?: string;
}

/** A streamed Claude Code event (stream-json JSONL line). */
export interface ClaudeCodeEvent {
  type: string; // "assistant" | "result" | "tool_use" | …
  [k: string]: unknown;
}

export interface ClaudeCodeResult {
  ok: boolean;
  sandboxId?: string;
  /** Claude Code session id — pass to a follow-up run via `resumeSessionId`. */
  sessionId?: string;
  /** Final assistant summary text, when available. */
  summary?: string;
  /** Files created/modified by the run (captured via git diff). */
  changedFiles?: SandboxFile[];
  /** Unified diff of all changes. */
  diff?: string;
  logs?: string;
  error?: string;
}

export interface SandboxProvider {
  readonly id: "modal" | "e2b" | "docker" | "firecracker";
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
    /** Project id — enables Lovable-style named warm sandboxes. */
    projectId?: string;
    /** Modal boot progress (creating → writing → installing → starting → ready). */
    onProgress?: (phase: string, detail?: string) => void;
  }): Promise<SandboxRunResult>;
  /** Tail the sandbox Vite/Next log (Modal `/tmp/lifemark-dev.log`). */
  getDevLogs?(sandboxId: string, lines?: number): Promise<string>;
  /**
   * Run Claude Code agentically inside the sandbox (E2B `claude` template).
   * Writes the project, runs `claude -p <task>` with streaming JSON, and returns
   * the changed files + diff. The highest-fidelity agent: real filesystem,
   * terminal, and git — beyond the in-app OpenRouter ReAct loop.
   */
  runClaudeCode(opts: {
    task: string;
    files?: SandboxFile[];
    /** Optional: clone a repo instead of writing files. */
    repoUrl?: string;
    githubToken?: string;
    /** Project context written to CLAUDE.md before the run. */
    systemPrompt?: string;
    /** Resume a previous Claude Code session for a follow-up task. */
    resumeSessionId?: string;
    /** Stream events (assistant/tool_use/result) for live UI. */
    onEvent?: (event: ClaudeCodeEvent) => void;
    timeoutMs?: number;
  }): Promise<ClaudeCodeResult>;
  /** Run a shell command in an existing sandbox. */
  exec(sandboxId: string, command: string): Promise<CommandResult>;
  /** Write/update files in an existing sandbox (incremental edits).
   *  MAY return the normalized paths that actually changed on disk (Docker
   *  provider does — it diffs against a content-hash manifest). Callers use
   *  this to gate side effects like npm install / vite restart on REAL changes;
   *  providers returning void get the caller's conservative fallback. */
  writeFiles(
    sandboxId: string,
    files: SandboxFile[],
  ): Promise<void | { written: string[] }>;
  /**
   * Type-check the project in place, using its OWN installed dependencies.
   *
   * Optional because it only makes sense where the provider has a real
   * filesystem with node_modules on it. Where it is available it is the only
   * check in the system that can tell a real import from a plausible-looking
   * one — every other check is a regex over source text, which cannot know
   * whether a package actually exports the name being imported.
   */
  typecheckProject?(
    sandboxId: string,
    opts?: { timeoutSec?: number },
  ): Promise<TypecheckResult>;
  /** Re-derive the live preview URL for a running sandbox. */
  getPreviewUrl(sandboxId: string, port?: number): Promise<string>;
  /** Reconnect to an existing sandbox if still alive (Lovable warm-session parity). */
  reconnect(sandboxId: string, port?: number): Promise<SandboxRunResult>;
  /** Reconnect by stable project name (Modal named sandboxes). */
  reconnectByProject?(projectId: string, port?: number): Promise<SandboxRunResult>;
  /**
   * Reset the idle/wall-clock timer so an actively-edited sandbox never expires,
   * AND verify the tunnel is actually serving (a zombie container can outlive its
   * dev server). When the tunnel is dead but compute is alive, the provider may
   * restart the dev server in place and report `tunnelHealthy`/`restarted`.
   */
  keepAlive?(
    sandboxId: string,
    opts?: { previewUrl?: string; port?: number },
  ): Promise<{ alive: boolean; tunnelHealthy?: boolean; restarted?: boolean }>;
  /** Tear down a sandbox. */
  kill(sandboxId: string): Promise<void>;
}

import { DEFAULT_TIMEOUT_MS, trunc, waitForServer } from "./shared.ts";
import { ModalSandboxProvider } from "./modal.ts";
import { DockerSandboxProvider } from "./docker.ts";
export {
  detectSandboxStart,
  sandboxNameForProject,
  isPreviewReachable,
  peekPreviewReachable,
  getPreviewProbeState,
  forgetPreviewProbe,
} from "./shared.ts";
export { ModalSandboxProvider } from "./modal.ts";

const DEFAULT_PORT = 3000;

/**
 * Where the E2B dev server's output is teed.
 *
 * Mirrors the Modal provider's `/tmp/lifemark-dev.log` so `getDevLogs()` — and
 * therefore /api/projects/:id/sandbox-preview/logs and the chat error surfacing
 * — behave identically whichever provider is active.
 */
const E2B_DEV_LOG = "/tmp/lifemark-dev.log";

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

function truncLocal(s: string, n = 4000): string {
  return trunc(s, n);
}

/** DRAFT / LEGACY — E2B sandbox. Opt-in via SANDBOX_PROVIDER=e2b or ENABLE_E2B_SANDBOX=1. */
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
    /** Present so E2B matches the Modal provider's contract (see below). */
    projectId?: string;
    onProgress?: (phase: string, detail?: string) => void;
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
    // The caller (routes/api/projects/$id/sandbox-preview.ts) always passes
    // onProgress and persists each phase to project metadata; the preview panel
    // polls that to drive "Provisioning… / Writing N files / Installing
    // dependencies / Starting…". E2B previously did not declare or call it, so
    // switching providers left the UI frozen on one phase for the whole ~2min
    // boot with no sign of life. Emit the same phase vocabulary as Modal.
    const progress = opts.onProgress ?? (() => {});
    try {
      progress("creating", "Provisioning E2B sandbox");
      const sandbox = await e2b.Sandbox.create(opts.template ?? this.template);
      await sandbox.setTimeout(timeoutMs);

      progress("writing", `Writing ${opts.files.length} files`);
      for (const f of opts.files) {
        await sandbox.files.write(f.path, f.content);
      }

      let logs = "";
      // Install deps if a package.json is present.
      if (opts.files.some((f) => f.path.endsWith("package.json"))) {
        progress("installing", "Installing dependencies");
        const install = await sandbox.commands.run("npm install", {
          onStdout: (d: string) => (logs += d),
          onStderr: (d: string) => (logs += d),
        });
        logs += install?.stdout ?? "";
      }

      // Start the dev server in the background (don't await — it's long-lived).
      //
      // The old fallback was `npx next dev` — a Next.js leftover. This product
      // no longer ships Next at all, and detectSandboxStart() yields a Vite
      // command for generated projects, so a Next default could only ever fire
      // on a project whose start command failed to detect and would then fail
      // with "next: not found". Vite is the correct floor.
      const start = opts.startCommand ?? `npx vite --host 0.0.0.0 --port ${port}`;
      progress("starting", start);
      // Tee output to a file so getDevLogs() can tail it — same contract as the
      // Modal provider (/tmp/lifemark-dev.log), which the logs endpoint and the
      // chat error-surfacing both rely on.
      void sandbox.commands
        .run(`${start} > ${E2B_DEV_LOG} 2>&1`, { background: true })
        .catch(() => {});

      const host = await sandbox.getHost(port);
      const previewUrl = `https://${host}`;
      progress("starting", "Waiting for the dev server to respond");
      // Don't hand back the URL until the dev server is actually responding —
      // getHost() returns before the server is up, so without this the preview
      // iframe loads a dead URL and shows a blank / connection-refused page.
      const ready = await waitForServer(previewUrl, 120_000);
      return {
        ok: true,
        sandboxId: sandbox.sandboxId,
        previewUrl,
        logs: truncLocal(
          logs + (ready ? "" : "\n[preview] dev server was slow to start — give the preview a moment to load."),
        ),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async runClaudeCode(opts: {
    task: string;
    files?: SandboxFile[];
    repoUrl?: string;
    githubToken?: string;
    systemPrompt?: string;
    resumeSessionId?: string;
    onEvent?: (event: ClaudeCodeEvent) => void;
    timeoutMs?: number;
  }): Promise<ClaudeCodeResult> {
    if (!this.isEnabled()) return { ok: false, error: "E2B not configured (set E2B_API_KEY)." };
    if (!process.env.ANTHROPIC_API_KEY) {
      return { ok: false, error: "Claude Code needs ANTHROPIC_API_KEY (a direct Anthropic key, separate from OpenRouter)." };
    }
    const e2b = await loadE2B();
    if (!e2b) return { ok: false, error: "E2B SDK not installed (npm i @e2b/code-interpreter)." };

    const template = process.env.E2B_CLAUDE_TEMPLATE || "claude";
    const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
    const dir = "/home/user/app";
    const sh = (s: string) => `'${s.replace(/'/g, "'\\''")}'`; // single-quote shell escape
    let logs = "";
    const append = (d: string) => { logs += d; };

    try {
      const sandbox = await e2b.Sandbox.create(template, {
        envs: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY as string },
        timeoutMs,
      });
      await sandbox.setTimeout(timeoutMs);

      // Stage the project. Either clone a repo or write the provided files.
      if (opts.repoUrl) {
        if (opts.githubToken && (sandbox as any).git?.clone) {
          await (sandbox as any).git.clone(opts.repoUrl, {
            path: dir, username: "x-access-token", password: opts.githubToken, depth: 1,
          });
        } else {
          await sandbox.commands.run(`git clone --depth 1 ${sh(opts.repoUrl)} ${dir}`, { onStderr: append });
        }
      } else {
        await sandbox.commands.run(`mkdir -p ${dir}`);
        for (const f of opts.files ?? []) await sandbox.files.write(`${dir}/${f.path}`, f.content);
      }

      // Baseline commit so a post-run `git diff` captures exactly what Claude changed.
      await sandbox.commands.run(
        `cd ${dir} && (git rev-parse --git-dir >/dev/null 2>&1 || git init -q) && ` +
          `git config user.email lifemark@local && git config user.name lifemark && ` +
          `git add -A && git commit -q -m baseline || true`,
        { onStderr: append },
      );

      if (opts.systemPrompt) await sandbox.files.write(`${dir}/CLAUDE.md`, opts.systemPrompt);

      // Run Claude Code with a streaming JSONL event feed.
      let sessionId: string | undefined;
      let summary: string | undefined;
      const resume = opts.resumeSessionId ? `--resume ${sh(opts.resumeSessionId)} ` : "";
      const cmd =
        `cd ${dir} && claude --dangerously-skip-permissions --output-format stream-json ` +
        `${resume}-p ${sh(opts.task)}`;
      await sandbox.commands.run(cmd, {
        onStdout: (d: string) => {
          append(d);
          for (const line of d.split("\n")) {
            const t = line.trim();
            if (!t) continue;
            try {
              const ev = JSON.parse(t) as ClaudeCodeEvent;
              const sid = (ev as Record<string, unknown>).session_id;
              if (typeof sid === "string") sessionId = sid;
              const r = (ev as Record<string, unknown>).result;
              if (ev.type === "result" && typeof r === "string") summary = r;
              opts.onEvent?.(ev);
            } catch { /* non-JSON log line — ignore */ }
          }
        },
        onStderr: append,
      });

      // Capture changes vs the baseline commit.
      await sandbox.commands.run(`cd ${dir} && git add -A`, { onStderr: append });
      const nameRes = await sandbox.commands.run(`cd ${dir} && git diff --cached --name-only`);
      const diffRes = await sandbox.commands.run(`cd ${dir} && git diff --cached`);
      const names = (nameRes?.stdout ?? "").split("\n").map((s: string) => s.trim()).filter(Boolean);
      const changedFiles: SandboxFile[] = [];
      for (const name of names) {
        try {
          const content = await sandbox.files.read(`${dir}/${name}`);
          changedFiles.push({ path: name, content: typeof content === "string" ? content : String(content) });
        } catch { /* deleted file — skip */ }
      }

      return {
        ok: true,
        sandboxId: sandbox.sandboxId,
        sessionId,
        summary,
        changedFiles,
        diff: truncLocal(diffRes?.stdout ?? "", 60000),
        logs: truncLocal(logs),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), logs: truncLocal(logs) };
    }
  }

  private async connect(sandboxId: string): Promise<any> {
    const e2b = await loadE2B();
    if (!e2b) throw new Error("E2B SDK not installed.");
    const sandbox = await e2b.Sandbox.connect(sandboxId);
    await sandbox.setTimeout(DEFAULT_TIMEOUT_MS);
    return sandbox;
  }

  /**
   * Tail the dev-server log. Optional on the interface, but without it the
   * logs endpoint returns nothing under E2B and preview failures become
   * undebuggable — exactly the blind spot that made the Modal spend-limit
   * error take so long to find.
   */
  async getDevLogs(sandboxId: string, lines = 200): Promise<string> {
    try {
      const res = await this.exec(sandboxId, `tail -n ${lines} ${E2B_DEV_LOG}`);
      return truncLocal(res.stdout || res.stderr || "");
    } catch (err) {
      return `[e2b] could not read ${E2B_DEV_LOG}: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
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

  async reconnect(sandboxId: string, port = DEFAULT_PORT): Promise<SandboxRunResult> {
    if (!this.isEnabled()) {
      return { ok: false, error: "E2B not configured (set E2B_API_KEY)." };
    }
    try {
      const previewUrl = await this.getPreviewUrl(sandboxId, port);
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
    return { ok: false, error: "reconnectByProject not supported for E2B" };
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

/** Draft/legacy: E2B only when explicitly opted in. */
function isE2bSandboxAllowed(): boolean {
  const pref = (process.env.SANDBOX_PROVIDER ?? "").toLowerCase();
  if (pref === "e2b") return true;
  const flag = process.env.ENABLE_E2B_SANDBOX;
  return flag === "1" || flag === "true";
}

/**
 * Lovable production path = Modal.
 * E2B is draft/legacy and never auto-selected.
 */
export function getSandboxProvider(): SandboxProvider {
  if (!cached) {
    const pref = (process.env.SANDBOX_PROVIDER ?? "auto").toLowerCase();
    const modal = new ModalSandboxProvider();
    const e2b = new E2BSandboxProvider();
    if (pref === "docker") {
      // Self-hosted Docker runner. EXPLICIT OPT-IN ONLY — never auto-selected,
      // because it executes untrusted generated code on your own host and that
      // should always be a decision, never a fallback nobody noticed.
      const dockerProvider = new DockerSandboxProvider();
      if (dockerProvider.isEnabled()) {
        cached = dockerProvider;
        return cached;
      }
      console.warn(
        "[sandbox] SANDBOX_PROVIDER=docker but neither SANDBOX_PREVIEW_DOMAIN nor SANDBOX_PUBLIC_HOST is set — falling back.",
      );
    }
    if (pref === "e2b" && isE2bSandboxAllowed()) {
      cached = e2b;
    } else if (pref === "modal" || modal.isEnabled()) {
      cached = modal;
    } else if (isE2bSandboxAllowed() && e2b.isEnabled()) {
      // Explicit draft opt-in only — never silent fallback.
      cached = e2b;
    } else {
      // Modal class still returned so isEnabled() is false → thin srcdoc fallback.
      cached = modal;
    }
  }
  return cached;
}

/** Active provider id (modal | e2b | …). */
export function getSandboxProviderId(): SandboxProvider["id"] {
  return getSandboxProvider().id;
}

/**
 * True when the production Modal sandbox (or explicitly enabled draft E2B) is available.
 * When false, the editor shows "Modal preview required" — not WebContainer/srcdoc/esbuild.
 */
export function isSandboxEnabled(): boolean {
  const provider = getSandboxProvider();
  if (provider.id === "e2b" && !isE2bSandboxAllowed()) return false;
  return provider.isEnabled();
}
