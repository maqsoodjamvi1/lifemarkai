import { createFileRoute } from "@tanstack/react-router";
import { getPreviewSloSnapshot, recordPreviewSlo, type PreviewSloEvent } from "@/lib/preview/preview-slo";

const EVENTS = new Set<PreviewSloEvent>([
  "preview.boot_ms",
  "preview.settle_ms",
  "preview.reconnect_ok",
  "preview.pause",
  "preview.resume_ms",
]);

export const Route = createFileRoute("/api/sandbox/metrics")({
  server: {
    handlers: {
      GET: async () => Response.json(getPreviewSloSnapshot()),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          event?: string;
          ms?: number;
          projectId?: string;
        };
        if (!body.event || !EVENTS.has(body.event as PreviewSloEvent)) {
          return Response.json({ error: "Unknown SLO event" }, { status: 400 });
        }
        const rec = recordPreviewSlo(body.event as PreviewSloEvent, {
          ms: typeof body.ms === "number" ? body.ms : undefined,
          projectId: typeof body.projectId === "string" ? body.projectId : undefined,
        });
        return Response.json({ ok: true, ...rec });
      },
    },
  },
});
