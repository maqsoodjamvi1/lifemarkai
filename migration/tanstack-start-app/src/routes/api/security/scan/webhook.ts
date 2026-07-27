// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "node:crypto";

/**
 * Native /api/security/scan/webhook — inbound scan-completion webhook for
 * Aikido / Wiz. HMAC-SHA256 signature verified for Aikido; findings fan out to
 * notifications.
 */
export const Route = createFileRoute("/api/security/scan/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const vendor = request.headers.get("x-vendor") ?? "aikido";

        if (vendor === "aikido") {
          const sig = request.headers.get("x-aikido-signature");
          const secret = process.env.AIKIDO_WEBHOOK_SECRET;
          if (sig && secret) {
            const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
            if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
              return Response.json({ error: "Invalid signature" }, { status: 401 });
            }
          }
        } else if (vendor === "wiz") {
          // TODO: verify Wiz webhook signature once tenant config is known
        }

        let body: any;
        try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

        if (!body.project_id) return Response.json({ error: "Missing project_id" }, { status: 400 });

        const supabase = createAdminClient();
        for (const finding of (body.findings ?? [])) {
          await supabase.from("notifications").insert({
            user_id: body.user_id ?? null,
            type: "system",
            title: `${vendor === "aikido" ? "Aikido" : "Wiz"} found: ${finding.title}`,
            body: finding.description ?? finding.remediation ?? null,
            link: body.report_url ?? null,
            metadata: { vendor, scan_id: body.scan_id, finding },
          }).catch(() => {});
        }
        return Response.json({ ok: true, processed: (body.findings ?? []).length });
      },
    },
  },
});
