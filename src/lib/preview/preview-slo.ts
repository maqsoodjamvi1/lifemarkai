import { logger } from "@/lib/logger";

export type PreviewSloEvent =
  | "preview.boot_ms"
  | "preview.settle_ms"
  | "preview.reconnect_ok"
  | "preview.pause"
  | "preview.resume_ms";

export type PreviewSloRecord = {
  event: PreviewSloEvent;
  ms?: number;
  projectId?: string;
  at: string;
};

const RING_MAX = 40;
const ring: PreviewSloRecord[] = [];

export function recordPreviewSlo(
  event: PreviewSloEvent,
  fields: { ms?: number; projectId?: string } = {},
): PreviewSloRecord {
  const rec: PreviewSloRecord = {
    event,
    ms: fields.ms,
    projectId: fields.projectId,
    at: new Date().toISOString(),
  };
  ring.push(rec);
  if (ring.length > RING_MAX) ring.shift();
  logger.info(event, { ms: fields.ms, projectId: fields.projectId });
  return rec;
}

export function getPreviewSloSnapshot(): {
  last: PreviewSloRecord | null;
  recent: PreviewSloRecord[];
} {
  return {
    last: ring.length ? ring[ring.length - 1]! : null,
    recent: ring.slice(-12),
  };
}

/** Browser: POST timings to the sandbox metrics route (logger runs server-side). */
export function reportPreviewSlo(
  event: PreviewSloEvent,
  fields: { ms?: number; projectId?: string } = {},
): void {
  if (typeof fetch === "undefined") return;
  void fetch("/api/sandbox/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, ...fields }),
    keepalive: true,
  }).catch(() => {});
}
