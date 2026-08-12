import { createFileRoute } from "@tanstack/react-router";
import { listActivity } from "@/lib/server-fns/activity";

/** Native /api/activity — dashboard activity feed. */
export const Route = createFileRoute("/api/activity")({
  server: {
    handlers: {
      GET: async () => {
        const result = await listActivity();
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return Response.json({ events: result.events });
      },
    },
  },
});
