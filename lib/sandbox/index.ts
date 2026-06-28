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

/**
 * Poll a URL until the dev server inside the sandbox actually responds.
 * `getHost(port)` only maps the port — it returns instantly, before `next dev` /
 * `vite` has started listening. Returning the URL too early makes the preview
 * iframe load a dead URL (blank / connection refused). Any HTTP response — even
 * a 404 — means the server is up.
 */
async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
      if (res.status > 0) return true;
    } catch {
      /* dev server not listening yet — retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
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
      const previewUrl = `https://${host}`;
      // Don't hand back the URL until the dev server is actually responding —
      // getHost() returns before the server is up, so without this the preview
      // iframe loads a dead URL and shows a blank / connection-refused page.
      const ready = await waitForServer(previewUrl, 120_000);
      return {
        ok: true,
        sandboxId: sandbox.sandboxId,
        previewUrl,
        logs: trunc(
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
        diff: trunc(diffRes?.stdout ?? "", 60000),
        logs: trunc(logs),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), logs: trunc(logs) };
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
