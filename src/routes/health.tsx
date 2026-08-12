import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          app: "lifemarkai-tanstack-start",
          ts: new Date().toISOString(),
        }),
    },
  },
  component: () => (
    <pre className="p-6 text-sm">
      {JSON.stringify({ ok: true, app: "lifemarkai-tanstack-start" }, null, 2)}
    </pre>
  ),
});
