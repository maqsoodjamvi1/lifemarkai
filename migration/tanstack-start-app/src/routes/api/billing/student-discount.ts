import { createFileRoute } from "@tanstack/react-router";
import { grantStudentDiscount } from "@/lib/server-fns/billing-native";

/** Native /api/billing/student-discount — 50%-off-3-months .edu coupon (off the worker). */
export const Route = createFileRoute("/api/billing/student-discount")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { eduEmail?: string };
        const r = await grantStudentDiscount({ eduEmail: body.eduEmail ?? "" });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "error") return Response.json({ error: r.message }, { status: r.code });
        return Response.json({ message: r.message });
      },
    },
  },
});
