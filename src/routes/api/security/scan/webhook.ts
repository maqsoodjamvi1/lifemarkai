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
          // Fail CLOSED, matching leaked-key.ts: `if (sig && secret)` used to
          // skip verification entirely whenever either was missing — which
          // includes an attacker simply omitting the signature header, not
          // just a misconfigured secret. That let anyone POST here and get
          // an admin-client-written notification (arbitrary title/body/link)
          // fanned out to any user_id of their choosing. A vendor request
          // with no signature is now rejected outright, same as a bad one.
          const sig = request.headers.get("x-aikido-signature");
          const secret = process.env.AIKIDO_WEBHOOK_SECRET;
          if (!sig || !secret) {
            return Response.json({ error: "Missing signature" }, { status: 401 });
          }
          const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
          const sigBuf = Buffer.from(sig, "hex");
          const expectedBuf = Buffer.from(expected, "hex");
          if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            return Response.json({ error: "Invalid signature" }, { status: 401 });
          }
        } else if (vendor === "wiz") {
          // No verification key is available for Wiz yet — fail closed like
          // the aikido branch above, rather than trusting unauthenticated
          // input in the meantime.
          return Response.json({ error: "Wiz webhook verification not configured" }, { status: 501 });
        } else {
          return Response.json({ error: `Unknown vendor: ${vendor}` }, { status: 400 });
        }

        let body: any;
        try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

        if (!body.project_id) return Response.json({ error: "Missing project_id" }, { status: 400 });

        const supabase = createAdminClient();
        for (const finding of (body.findings ?? [])) {
          try {
            await supabase.from("notifications").insert({
              user_id: body.user_id ?? null,
              type: "system",
              title: `${vendor === "aikido" ? "Aikido" : "Wiz"} found: ${finding.title}`,
              body: finding.description ?? finding.remediation ?? null,
              link: body.report_url ?? null,
              metadata: { vendor, scan_id: body.scan_id, finding },
            });
          } catch {
            // Notification fan-out is best-effort; acknowledge the webhook so
            // vendors do not retry an otherwise processed scan indefinitely.
          }
        }
        return Response.json({ ok: true, processed: (body.findings ?? []).length });
      },
    },
  },
});
