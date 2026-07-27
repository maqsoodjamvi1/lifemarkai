import { createAdminClient } from "@/lib/supabase/server";
import { getRegistrar, type RegistrantContact, type DnsRecord } from "@/lib/domains/registrar";
import { connectDnsRecords, domainVerificationToken } from "@/lib/domains/entri";

export interface CompleteDomainPurchaseInput {
  projectId: string;
  userId: string;
  domain: string;
  contact: RegistrantContact;
  years?: number;
  autoRenew?: boolean;
  priceCents?: number;
  stripeRef?: string;
}

/** Register domain + wire DNS + persist (shared by direct purchase + Stripe webhook). */
export async function completeDomainPurchase(input: CompleteDomainPurchaseInput) {
  const {
    projectId,
    userId,
    domain,
    contact,
    years = 1,
    autoRenew = true,
    priceCents = 0,
    stripeRef,
  } = input;

  const supabase = await createAdminClient();
  const registrar = getRegistrar();
  const yr = Math.min(Math.max(years, 1), 10);

  const result = await registrar.register(domain, contact, yr);
  if (!result.ok) {
    await (supabase as any).from("domain_registrations").upsert({
      project_id: projectId,
      user_id: userId,
      domain,
      registrar: registrar.id,
      status: "failed",
      years: yr,
      auto_renew: autoRenew,
      price_cents: priceCents,
      stripe_ref: stripeRef ?? null,
      metadata: { error: result.error },
    }, { onConflict: "domain" });
    return { ok: false as const, error: result.error ?? "Registration failed" };
  }

  const verifyToken = domainVerificationToken(domain, projectId);
  const records: DnsRecord[] = connectDnsRecords(domain, projectId).map((r) => ({
    type: r.type,
    name: r.host,
    value: r.value,
    ttl: r.ttl,
  }));

  try {
    await registrar.configureDns(domain, records);
  } catch (err) {
    console.error("[domains/purchase] DNS wiring failed:", err);
  }

  await (supabase as any).from("domain_registrations").upsert({
    project_id: projectId,
    user_id: userId,
    domain,
    registrar: registrar.id,
    status: "dns_pending",
    years: yr,
    auto_renew: autoRenew,
    price_cents: priceCents,
    stripe_ref: stripeRef ?? null,
    registration_ref: result.registrationRef ?? null,
    verify_token: verifyToken,
    expires_at: result.expiresAt ?? null,
  }, { onConflict: "domain" });

  await (supabase as any).from("projects").update({
    custom_domain: domain,
    custom_domain_token: verifyToken,
    custom_domain_verified: false,
  }).eq("id", projectId);

  return {
    ok: true as const,
    domain,
    registrar: registrar.id,
    registrationRef: result.registrationRef,
    expiresAt: result.expiresAt,
    status: "dns_pending" as const,
    dnsRecords: records,
  };
}
