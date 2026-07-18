import type { SandboxFile } from "./index";

export const DEFAULT_SANDBOX_PORT = 5173;
export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export function trunc(s: string, n = 4000): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Poll until the dev server inside the sandbox responds (any HTTP status counts). */
export async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
      if (res.status > 0) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

export function sandboxNameForProject(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 48);
  return `preview-${safe || "project"}`;
}

export function detectSandboxStart(files: SandboxFile[]): { port: number; startCommand: string } {
  const paths = files.map((f) => f.path.replace(/\\/g, "/"));
  const isNext = paths.some((p) => /next\.config\.(t|j|m)s$/.test(p));
  if (isNext) {
    const port = 3000;
    return { port, startCommand: `npx next dev -p ${port}` };
  }
  const port = Number(process.env.MODAL_PREVIEW_PORT ?? process.env.SANDBOX_PREVIEW_PORT ?? DEFAULT_SANDBOX_PORT);
  return {
    port,
    startCommand: `npm run dev -- --host 0.0.0.0 --port ${port}`,
  };
}
