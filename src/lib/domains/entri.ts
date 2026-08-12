/**
 * Entri connect-domain flow (Lovable-parity "connect an existing domain").
 *
 * Entri is NOT a registrar — it's a DNS-connection service. For a domain the
 * user already owns elsewhere, Entri detects their DNS provider and (with the
 * user's authorization, via a client popup) writes the DNS records for us, with
 * a manual A/TXT fallback. This module is the SERVER half: it mints a short-
 * lived Entri auth token from our app credentials and returns the DNS records
 * the user's domain needs to point at LifemarkAI.
 *
 * Credentials stay server-side (env). Client receives only the short-lived
 * token + the public config, mirroring the connector-gateway discipline.
 *
 * Env: ENTRI_APPLICATION_ID, ENTRI_SECRET (+ optional LIFEMARK_INGRESS_IP,
 * LIFEMARK_APP_DOMAIN for the CNAME target).
 */

import { createHash } from "crypto";
import { dnsRecordsForDomain } from "./hosting.ts";

const ENTRI_TOKEN_URL = "https://api.goentri.com/token";

export interface EntriDnsRecord {
  type: "A" | "CNAME" | "TXT";
  /** Host/subdomain; "@" for apex. */
  host: string;
  value: string;
  ttl: number;
}

export interface EntriConnectConfig {
  applicationId: string;
  /** Short-lived Entri auth token — safe to hand to the client SDK. */
  token: string;
  prefilledDomain: string;
  dnsRecords: EntriDnsRecord[];
  /** Records to show for the manual-setup fallback (same as dnsRecords). */
  manualRecords: EntriDnsRecord[];
}

export function isEntriConfigured(): boolean {
  return Boolean(process.env.ENTRI_APPLICATION_ID && process.env.ENTRI_SECRET);
}

/** Mint a short-lived Entri auth token from our application credentials. */
export async function getEntriAuthToken(): Promise<string | null> {
  const applicationId = process.env.ENTRI_APPLICATION_ID;
  const secret = process.env.ENTRI_SECRET;
  if (!applicationId || !secret) return null;

  try {
    const res = await fetch(ENTRI_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, secret }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { auth_token?: string; token?: string };
    return data.auth_token ?? data.token ?? null;
  } catch {
    return null;
  }
}

/** Per-domain ownership-verification token (deterministic, no secret leaked). */
export function domainVerificationToken(domain: string, projectId: string): string {
  const salt = process.env.DOMAIN_VERIFY_SALT ?? "lifemark-domain-verify";
  return "lifemark-verify=" + createHash("sha256").update(`${domain}:${projectId}:${salt}`).digest("hex").slice(0, 32);
}

/**
 * DNS records a connected domain must have to serve a LifemarkAI project.
 *
 * These now come from `hosting.ts`, which is the module that actually knows
 * where projects are served, rather than being computed here a second time.
 *
 * The hand-rolled version this replaces was wrong in a way no test could catch
 * and no user could diagnose. It pointed apex domains at 76.76.21.21 — a
 * VERCEL address — and subdomains at `lifemark-<id>.lifemarkai.app`, while
 * projects are in fact served by Netlify at 75.2.60.5 / 99.83.190.102 and
 * `lifemark-<id>.netlify.app`. Anyone who followed these records, by hand or
 * through Entri's one-click flow, pointed their domain at a host that had never
 * heard of them.
 *
 * It also disagreed with `setProjectDomain`, which independently emitted the
 * CORRECT Netlify values — so the product gave two different answers to "what
 * DNS do I need?" depending on which button you pressed. One source of truth
 * is the fix; verification in hosting.ts reads the same values, so records
 * shown and records checked can no longer drift apart.
 */
export function connectDnsRecords(domain: string, projectId: string): EntriDnsRecord[] {
  const verifyToken = domainVerificationToken(domain, projectId);
  return dnsRecordsForDomain(projectId, domain, verifyToken).map((r) => ({
    type: r.type as EntriDnsRecord["type"],
    host: r.name,
    value: r.value,
    ttl: 3600,
  }));
}

/**
 * Build the full config the client SDK needs to open the Entri modal. Returns
 * null when Entri isn't configured or the token mint fails — the caller should
 * then fall back to showing `connectDnsRecords()` for manual setup.
 */
export async function buildEntriConnectConfig(domain: string, projectId: string): Promise<EntriConnectConfig | null> {
  const applicationId = process.env.ENTRI_APPLICATION_ID;
  if (!applicationId) return null;
  const token = await getEntriAuthToken();
  if (!token) return null;

  const dnsRecords = connectDnsRecords(domain, projectId);
  return {
    applicationId,
    token,
    prefilledDomain: domain,
    dnsRecords,
    manualRecords: dnsRecords,
  };
}
