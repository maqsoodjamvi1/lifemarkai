import { createFileRoute } from "@tanstack/react-router";
import { debugLog } from "@/lib/debug-log";

/**
 * Client → file NDJSON bridge when the Cursor ingest server is unreachable.
 * POST body: { hypothesisId, location, message, data?, runId? }
 */
export const Route = createFileRoute("/api/debug-log")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            hypothesisId?: string;
            location?: string;
            message?: string;
            data?: Record<string, unknown>;
            runId?: string;
          };
          debugLog({
            hypothesisId: body.hypothesisId ?? "CLIENT",
            location: body.location ?? "api/debug-log",
            message: body.message ?? "client log",
            data: body.data,
            runId: body.runId,
          });
          return Response.json({ ok: true });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : "bad request" },
            { status: 400 },
          );
        }
      },
    },
  },
});
