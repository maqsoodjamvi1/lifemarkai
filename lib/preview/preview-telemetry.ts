/**
 * In-memory ring buffer of preview console + network events per project.
 * The preview panel POSTs here; the agent reads via tools.
 */

export type PreviewConsoleLine = {
  type: string;
  text: string;
  at: number;
};

export type PreviewNetworkLine = {
  method: string;
  url: string;
  status?: number;
  ok?: boolean;
  durationMs?: number;
  contentType?: string;
  error?: string;
  at: number;
};

type Bucket = {
  console: PreviewConsoleLine[];
  network: PreviewNetworkLine[];
  updatedAt: number;
};

const MAX_LINES = 100;
const store = new Map<string, Bucket>();

function bucket(projectId: string): Bucket {
  let b = store.get(projectId);
  if (!b) {
    b = { console: [], network: [], updatedAt: Date.now() };
    store.set(projectId, b);
  }
  return b;
}

export function appendPreviewConsole(
  projectId: string,
  lines: Array<{ type?: string; text: string }>,
): void {
  const b = bucket(projectId);
  const now = Date.now();
  for (const line of lines) {
    if (!line?.text) continue;
    b.console.push({ type: line.type ?? "log", text: String(line.text).slice(0, 2000), at: now });
  }
  if (b.console.length > MAX_LINES) b.console = b.console.slice(-MAX_LINES);
  b.updatedAt = now;
}

export function appendPreviewNetwork(
  projectId: string,
  lines: Array<{
    method?: string;
    url: string;
    status?: number;
    ok?: boolean;
    durationMs?: number;
    contentType?: string;
    error?: string;
  }>,
): void {
  const b = bucket(projectId);
  const now = Date.now();
  for (const line of lines) {
    if (!line?.url) continue;
    b.network.push({
      method: (line.method ?? "GET").toUpperCase(),
      url: String(line.url).slice(0, 2000),
      status: line.status,
      ok: line.ok,
      durationMs: line.durationMs,
      contentType: line.contentType,
      error: line.error,
      at: now,
    });
  }
  if (b.network.length > MAX_LINES) b.network = b.network.slice(-MAX_LINES);
  b.updatedAt = now;
}

export function getPreviewTelemetry(projectId: string): {
  console: PreviewConsoleLine[];
  network: PreviewNetworkLine[];
  updatedAt: number | null;
} {
  const b = store.get(projectId);
  if (!b) return { console: [], network: [], updatedAt: null };
  return { console: [...b.console], network: [...b.network], updatedAt: b.updatedAt };
}

export function formatPreviewConsole(projectId: string, limit = 40): string {
  const { console: lines, updatedAt } = getPreviewTelemetry(projectId);
  if (lines.length === 0) {
    return "No preview console output captured yet. Ask the user to open Preview, or reproduce the issue.";
  }
  const slice = lines.slice(-limit);
  const age = updatedAt ? `${Math.round((Date.now() - updatedAt) / 1000)}s ago` : "unknown";
  return [`Preview console (${slice.length} lines, last update ${age}):`, ...slice.map((l) => `[${l.type}] ${l.text}`)].join("\n");
}

export function formatPreviewNetwork(projectId: string, limit = 40): string {
  const { network: lines, updatedAt } = getPreviewTelemetry(projectId);
  if (lines.length === 0) {
    return "No preview network requests captured yet. Ask the user to open Preview and trigger API calls.";
  }
  const slice = lines.slice(-limit);
  const age = updatedAt ? `${Math.round((Date.now() - updatedAt) / 1000)}s ago` : "unknown";
  return [
    `Preview network (${slice.length} requests, last update ${age}):`,
    ...slice.map((l) => {
      const status = l.status != null ? String(l.status) : "—";
      const ms = l.durationMs != null ? `${l.durationMs}ms` : "—";
      const ct = l.contentType ? ` ${l.contentType.split(";")[0]}` : "";
      const err = l.error ? ` ERR:${l.error}` : "";
      return `${l.method} ${status} ${ms}${ct} ${l.url}${err}`;
    }),
  ].join("\n");
}
