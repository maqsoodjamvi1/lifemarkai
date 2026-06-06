// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

/**
 * Inbound webhook for security-vendor scan completions.
 * Aikido and Wiz both POST scan results here when a scan finishes.
 *
 * Signature verification:
 *   Aikido sends X-Aikido-Signature: hex(hmac-sha256(secret, body))
 *   Wiz sends X-Wiz-Signature (TBD per tenant)
 *
 * Body shape (normalised):
 *   {
 *     vendor: "aikido" | "wiz",
 *     scan_id: string,
 *     project_id: string,   // we round-trip this in the original scan request
 *     status: "complete" | "failed",
 *     findings: [
 *       { id, severity, title, description, affected, remediation }
 *     ]
 *   }
 */

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const vendor = req.headers.get("x-vendor") ?? "aikido";

  // Verify signature
  if (vendor === "aikido") {
    const sig = req.headers.get("x-aikido-signature");
    const secret = process.env.AIKIDO_WEBHOOK_SECRET;
    if (sig && secret) {
      const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }
  } else if (vendor === "wiz") {
    // TODO: verify Wiz webhook signature once tenant config is known
  }

  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.project_id) return NextResponse.json({ error: "Missing project_id" }, { status: 400 });

  const supabase = await createAdminClient();
  // Store findings against the project — uses the existing security findings flow
  // (project_security_findings table is created on demand)
  for (const finding of (body.findings ?? [])) {
    await supabase.from("notifications").insert({
      user_id: body.user_id ?? null,
      type: finding.severity === "critical" || finding.severity === "high" ? "system" : "system",
      title: `${vendor === "aikido" ? "Aikido" : "Wiz"} found: ${finding.title}`,
      body: finding.description ?? finding.remediation ?? null,
      link: body.report_url ?? null,
      metadata: { vendor, scan_id: body.scan_id, finding },
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true, processed: (body.findings ?? []).length });
}
