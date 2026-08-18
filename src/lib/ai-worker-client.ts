/**
 * Proxy AI requests to the isolated ai-http-worker process.
 * Never imports lib/ai/http or app/api into the Vite SSR graph.
 */
import { spawn,type ChildProcess } from "node:child_process";
import {
applyCorrelationHeaders,
correlationFromRequest,
ensureBuildRunId,
runWithCorrelation,
withCorrelationHeaders,
} from "./observability/correlation.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.LIFEMARK_AI_WORKER_HOST || "127.0.0.1";
const PORT = Number(process.env.LIFEMARK_AI_WORKER_PORT || 3010);
const BASE = `http://${HOST}:${PORT}`;

let child: ChildProcess | null = null;
let starting: Promise<void> | null = null;
let cleanupRegistered = false;

function stopOwnedWorker(): void {
  if (child && child.exitCode === null && !child.killed) {
    child.kill("SIGTERM");
  }
}

function registerWorkerCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  // The worker is intentionally long-lived during dev, but it must not outlive
  // the Vite SSR process that owns it. Otherwise the next reliability run cannot
  // bind its well-known port (3010).
  process.once("exit", stopOwnedWorker);
}

function workerScript(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../scripts/ai-http-worker.mjs");
}

async function waitHealthy(timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  let lastErr = "not ready";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
      const data = (await res.json()) as { ok?: boolean; error?: string | null };
      if (res.ok && data.ok) return;
      lastErr = data.error || `health ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`AI worker not ready: ${lastErr}`);
}

async function ensureWorker(): Promise<void> {
  if (process.env.LIFEMARK_AI_WORKER_URL) return;
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
    const data = (await res.json()) as { ok?: boolean };
    if (res.ok && data.ok) return;
  } catch {
    /* spawn below */
  }

  if (!starting) {
    starting = (async () => {
      if (child && !child.killed) {
        await waitHealthy();
        return;
      }
      const script = workerScript();
      registerWorkerCleanup();
      child = spawn(process.execPath, [script], {
        cwd: path.dirname(script),
        env: {
          ...process.env,
          LIFEMARK_AI_WORKER_HOST: HOST,
          LIFEMARK_AI_WORKER_PORT: String(PORT),
          NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=8192"]
            .filter(Boolean)
            .join(" "),
        },
        stdio: ["ignore", "inherit", "inherit"],
        windowsHide: true,
      });
      child.on("exit", (code, signal) => {
        console.error(`[ai-worker-client] exited code=${code} signal=${signal}`);
        child = null;
        starting = null;
      });
      await waitHealthy();
    })().catch((err) => {
      starting = null;
      throw err;
    });
  }
  await starting;
}

/**
 * Forward one AI request to the worker process.
 *
 * The worker is a SEPARATE Node process, so in-process AsyncLocalStorage does
 * not reach it — the correlation ids travel as `x-lifemark-*` headers and the
 * worker re-establishes its own context from them. Chat and agent mint a
 * buildRunId here (they are the two entrypoints that start a user-visible
 * build) so generation, self-verify, repair rounds and the deploy that follows
 * all report the same run. `fix` deliberately does not: it runs INSIDE an
 * existing build and inherits that build's id from the incoming header.
 */
export async function proxyAiToWorker(
  name: "fix" | "chat" | "agent",
  request: Request,
): Promise<Response> {
  return runWithCorrelation(
    { ...correlationFromRequest(request), route: `api/ai/${name}` },
    async () => {
      if (name !== "fix") ensureBuildRunId();
      return withCorrelationHeaders(await forwardToWorker(name, request));
    },
  );
}

async function forwardToWorker(
  name: "fix" | "chat" | "agent",
  request: Request,
): Promise<Response> {
  const base = process.env.LIFEMARK_AI_WORKER_URL || BASE;
  try {
    if (!process.env.LIFEMARK_AI_WORKER_URL) {
      await ensureWorker();
    }
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "AI worker failed to start",
      },
      { status: 503 },
    );
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  applyCorrelationHeaders(headers);
  const body = await request.arrayBuffer();

  try {
    const res = await fetch(`${base}/ai/${name}`, {
      method: "POST",
      headers,
      body: body.byteLength ? body : undefined,
    });
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "AI worker unreachable",
      },
      { status: 503 },
    );
  }
}
