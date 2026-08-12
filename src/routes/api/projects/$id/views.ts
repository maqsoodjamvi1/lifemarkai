import { createFileRoute } from "@tanstack/react-router";
import { recordProjectView } from "@/lib/server-fns/project-social";

/** Native /api/projects/:id/views — public view tracking (no auth; 403 if private). */
export const Route = createFileRoute("/api/projects/$id/views")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown";
        const countryCode = request.headers.get("cf-ipcountry")?.slice(0, 2) ?? null;
        const body = (await request.json().catch(() => ({}))) as { referrer?: unknown };
        const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 255) : null;

        const r = await recordProjectView({ projectId: params.id, ip, referrer, countryCode });
        if (r.status === "forbidden") return Response.json({ ok: false }, { status: 403 });
        return Response.json({ ok: true });
      },
    },
  },
});
