/**
 * Preview console + network ring buffer.
 * Hot path stays in-memory; durable copy lives in `preview_telemetry` (migration 094)
 * so agent tools work across serverless instances / cold starts.
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

export function hydratePreviewTelemetry(
  projectId: string,
  data: {
    console?: PreviewConsoleLine[];
    network?: PreviewNetworkLine[];
    updatedAt?: string | number | null;
  },
): void {
  const b = bucket(projectId);
  if (Array.isArray(data.console) && data.console.length > 0 && b.console.length === 0) {
    b.console = data.console.slice(-MAX_LINES);
  }
  if (Array.isArray(data.network) && data.network.length > 0 && b.network.length === 0) {
    b.network = data.network.slice(-MAX_LINES);
  }
  if (data.updatedAt) {
    const t = typeof data.updatedAt === "number" ? data.updatedAt : Date.parse(String(data.updatedAt));
    if (Number.isFinite(t)) b.updatedAt = t;
  }
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

/** Persist current in-memory bucket to Supabase (best-effort). */
export async function persistPreviewTelemetry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
): Promise<void> {
  const snap = getPreviewTelemetry(projectId);
  await supabase.from("preview_telemetry").upsert(
    {
      project_id: projectId,
      console_lines: snap.console,
      network_lines: snap.network,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
  );
}

/** Load durable telemetry into memory if the hot cache is empty. */
export async function loadPreviewTelemetryFromDb(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
): Promise<void> {
  const current = getPreviewTelemetry(projectId);
  if (current.console.length > 0 || current.network.length > 0) return;

  const { data } = await supabase
    .from("preview_telemetry")
    .select("console_lines, network_lines, updated_at")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!data) return;
  hydratePreviewTelemetry(projectId, {
    console: data.console_lines as PreviewConsoleLine[],
    network: data.network_lines as PreviewNetworkLine[],
    updatedAt: data.updated_at,
  });
}
