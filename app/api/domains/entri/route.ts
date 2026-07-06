// @ts-nocheck
/**
 * POST /api/domains/entri — start the "connect an existing domain" flow.
 * Returns an Entri config (short-lived token + DNS records) for the client SDK
 * to open the Entri modal, or falls back to manual A/TXT records when Entri
 * isn't configured. Body: { projectId, domain }.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildEntriConnectConfig, connectDnsRecords, domainVerificationToken, isEntriConfigured,
} from "@/lib/domains/entri";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, domain } = (await req.json().catch(() => ({}))) as { projectId?: string; domain?: string };
  if (!projectId || !domain) {
    return NextResponse.json({ error: "projectId and domain are required" }, { status: 400 });
  }
  const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  if (!domainRegex.test(domain)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects").select("id").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Persist the ownership token so the verify step can confirm it later.
  const verifyToken = domainVerificationToken(domain, projectId);
  await supabase.from("projects").update({
    custom_domain: domain, custom_domain_token: verifyToken, custom_domain_verified: false,
  }).eq("id", projectId);
  await supabase.from("domain_registrations").upsert({
    project_id: projectId, user_id: user.id, domain, registrar: "namecom",
    status: "dns_pending", verify_token: verifyToken, metadata: { source: "connect" },
  }, { onConflict: "domain" });

  // Preferred: Entri automatic setup. Fallback: manual DNS records.
  const entri = await buildEntriConnectConfig(domain, projectId);
  if (entri) {
    return NextResponse.json({ mode: "entri", ...entri });
  }
  return NextResponse.json({
    mode: "manual",
    entriConfigured: isEntriConfigured(),
    prefilledDomain: domain,
    dnsRecords: connectDnsRecords(domain, projectId),
    message: isEntriConfigured()
      ? "Entri token unavailable; use the manual DNS records below."
      : "Add these DNS records at your domain provider, then verify.",
  });
}
