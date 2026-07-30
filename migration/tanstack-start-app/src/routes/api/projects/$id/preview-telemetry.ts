import { createFileRoute } from "@tanstack/react-router";
import {
  getPreviewTelemetryFn,
  postPreviewTelemetry,
} from "@/lib/server-fns/preview-telemetry";

function denied(result: { httpStatus: number; error: string }) {
  return Response.json({ error: result.error }, { status: result.httpStatus });
}

/** Native /api/projects/:id/preview-telemetry */
export const Route = createFileRoute("/api/projects/$id/preview-telemetry")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await getPreviewTelemetryFn({
          data: { projectId: params.id },
        });
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
          data: {
            projectId: params.id,
            console: Array.isArray(body.console) ? (body.console as any) : undefined,
            network: Array.isArray(body.network) ? (body.network as any) : undefined,
          },
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
