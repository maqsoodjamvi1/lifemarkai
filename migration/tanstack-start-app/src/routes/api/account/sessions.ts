import { createFileRoute } from "@tanstack/react-router";
import { listSessions, signOutOtherSessions } from "@/lib/server-fns/account";

/** Native /api/account/sessions — GET current session + audit log, DELETE = sign out others. */
export const Route = createFileRoute("/api/account/sessions")({
  server: {
    handlers: {
      GET: async () => {
        const r = await listSessions();
        if (r.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return Response.json({ currentSession: r.currentSession, auditLog: r.auditLog });
      },
      DELETE: async () => {
        const r = await signOutOtherSessions();
        if (r.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (r.status === "error") {
          return Response.json({ error: r.message }, { status: 500 });
        }
        return Response.json({ success: true });
      },
    },
  },
});
