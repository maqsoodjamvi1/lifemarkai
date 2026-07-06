// @ts-nocheck
/**
 * POST /api/domains/purchase — register a domain through the configured
 * registrar (Name.com) and wire it to a project, Lovable-style.
 *
 * Body: { projectId, domain, contact, years?, autoRenew? }
 *
 * NOTE ON BILLING: registration draws on the platform registrar account. In
 * production, collect payment first (Stripe checkout, kind='domain_purchase' —
 * see migration 069) and run this from the paid webhook. This route performs the
 * registrar action + DNS wiring + persistence; gate it behind your payment step.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRegistrar, isPurchaseEnabled, type RegistrantContact, type DnsRecord } from "@/lib/domains/registrar";
import { connectDnsRecords, domainVerificationToken } from "@/lib/domains/entri";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isPurchaseEnabled()) {
    return NextResponse.json({ error: "Domain purchase is not configured on this server." }, { status: 501 });
  }

  const { projectId, domain, contact, years = 1, autoRenew = true } = (await req.json().catch(() => ({}))) as {
    projectId?: string; domain?: string; contact?: RegistrantContact; years?: number; autoRenew?: boolean;
  };
  if (!projectId || !domain || !contact) {
    return NextResponse.json({ error: "projectId, domain and contact are required" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects").select("id").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const registrar = getRegistrar();

  // 1. Register the domain.
  const result = await registrar.register(domain, contact, Math.min(Math.max(years, 1), 10));
  if (!result.ok) {
    await supabase.from("domain_registrations").upsert({
      project_id: projectId, user_id: user.id, domain, registrar: registrar.id,
      status: "failed", years, auto_renew: autoRenew, metadata: { error: result.error },
    }, { onConflict: "domain" });
    return NextResponse.json({ error: result.error ?? "Registration failed" }, { status: 502 });
  }

  // 2. Wire DNS at the registrar: point the domain at the project + verification TXT.
  const verifyToken = domainVerificationToken(domain, projectId);
  const records: DnsRecord[] = connectDnsRecords(domain, projectId).map((r) => ({
    type: r.type, name: r.host, value: r.value, ttl: r.ttl,
  }));
  try {
    await registrar.configureDns(domain, records);
  } catch (err) {
    console.error("[domains/purchase] DNS wiring failed:", err);
    // Registration succeeded; DNS can be retried. Continue and persist.
  }

  // 3. Persist + attach to the project.
  await supabase.from("domain_registrations").upsert({
    project_id: projectId, user_id: user.id, domain, registrar: registrar.id,
    status: "dns_pending", years, auto_renew: autoRenew,
    registration_ref: result.registrationRef ?? null, verify_token: verifyToken,
    expires_at: result.expiresAt ?? null,
  }, { onConflict: "domain" });

  await supabase.from("projects").update({
    custom_domain: domain, custom_domain_token: verifyToken, custom_domain_verified: false,
  }).eq("id", projectId);

  return NextResponse.json({
    ok: true, domain, registrar: registrar.id,
    registrationRef: result.registrationRef, expiresAt: result.expiresAt,
    status: "dns_pending", dnsRecords: records,
  });
}
