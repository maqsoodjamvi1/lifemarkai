import { createFileRoute } from "@tanstack/react-router";
import {
getPreviewTelemetryFn,
postPreviewTelemetry,
} from "@/lib/server-fns/preview-telemetry";

type ConsoleEntry = { type?: string; text: string };
type NetworkEntry = {
  method?: string;
  url: string;
  status?: number;
  ok?: boolean;
  durationMs?: number;
  contentType?: string;
  error?: string;
};

function isConsoleEntry(value: unknown): value is ConsoleEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.text === "string" &&
    (entry.type === undefined || typeof entry.type === "string");
}

function isNetworkEntry(value: unknown): value is NetworkEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.url === "string" &&
    (entry.method === undefined || typeof entry.method === "string") &&
    (entry.status === undefined || typeof entry.status === "number") &&
    (entry.ok === undefined || typeof entry.ok === "boolean") &&
    (entry.durationMs === undefined || typeof entry.durationMs === "number") &&
    (entry.contentType === undefined || typeof entry.contentType === "string") &&
    (entry.error === undefined || typeof entry.error === "string");
}

function denied(result: { httpStatus: number; error: string }) {
  return Response.json({ error: result.error }, { status: result.httpStatus });
}

/** Native /api/projects/:id/preview-telemetry */
export const Route = createFileRoute("/api/projects/$id/preview-telemetry")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await getPreviewTelemetryFn({ projectId: params.id });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        return Response.json(result.telemetry);
      },
      POST: async ({ request, params }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const result = await postPreviewTelemetry({
          projectId: params.id,
          console: Array.isArray(body.console) ? body.console.filter(isConsoleEntry) : undefined,
          network: Array.isArray(body.network) ? body.network.filter(isNetworkEntry) : undefined,
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        return Response.json({ ok: true });
      },
    },
  },
});
