import { createAdminClient } from "../supabase/server.ts";
import { getRegistrar, type RegistrantContact, type DnsRecord } from "./registrar.ts";
import { connectDnsRecords, domainVerificationToken } from "./entri.ts";
import { getHostingTarget } from "./hosting.ts";

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

  // Registration already succeeded, so from here on a failure must be RECORDED
  // rather than thrown — the user has paid and owns the domain, and losing that
  // fact to an exception would be far worse than a domain that needs a retry.
  // But it must not be silent either: this used to `catch { console.error }`
  // and then return ok:true, so a domain that never got wired reported success.
  const wiringErrors: string[] = [];

  try {
    await registrar.configureDns(domain, records);
  } catch (err) {
    wiringErrors.push(`registrar DNS: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Attach the hostname to the hosting edge. This step did not exist, which
  // made purchase the most expensive version of the bug in this module: the
  // user paid real money, DNS was pointed correctly at Netlify, and Netlify had
  // never been told the hostname existed — so the domain resolved and then
  // served "Not Found", with a receipt to go with it.
  try {
    await getHostingTarget().attachHostname(projectId, domain);
  } catch (err) {
    wiringErrors.push(`hosting attach: ${err instanceof Error ? err.message : String(err)}`);
  }

  await (supabase as any).from("domain_registrations").upsert({
    project_id: projectId,
    user_id: userId,
    domain,
    registrar: registrar.id,
    status: wiringErrors.length ? "wiring_failed" : "dns_pending",
    years: yr,
    auto_renew: autoRenew,
    price_cents: priceCents,
    stripe_ref: stripeRef ?? null,
    registration_ref: result.registrationRef ?? null,
    verify_token: verifyToken,
    expires_at: result.expiresAt ?? null,
    // Keep the reason on the row. Support answering "you own it, this step
    // failed, here is which one" beats a console line nobody will ever read.
    metadata: wiringErrors.length ? { wiringErrors } : {},
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
    status: (wiringErrors.length ? "wiring_failed" : "dns_pending") as
      | "wiring_failed"
      | "dns_pending",
    dnsRecords: records,
    // ok:true means "the domain is registered and yours". It does NOT mean the
    // domain serves the project yet — the caller must show these.
    wiringErrors,
  };
}
