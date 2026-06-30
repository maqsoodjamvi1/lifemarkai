/**
 * Hosting-target abstraction + target-aware domain verification.
 * Part of the Lovable-parity domains and hosting flow.
 *
 * Replaces the naive "does it resolve to anything" check in
 * app/api/domains/verify/route.ts with a check that the domain actually points
 * at OUR hosting target, plus a TXT ownership token. Drivers keep the existing
 * Netlify behavior while allowing a future platform-owned edge.
 */
import { resolve4, resolveCname, resolveTxt } from "dns/promises";

export interface HostingTarget {
  readonly id: "netlify" | "platform";
  /** A records a custom apex domain must point at. */
  apexARecords(projectId: string): string[];
  /** CNAME target a subdomain must point at. */
  subdomainCname(projectId: string): string;
  /** Attach a hostname on the hosting edge (alias/route + request SSL). */
  attachHostname(projectId: string, domain: string): Promise<void>;
  /** Detach a hostname. */
  detachHostname(projectId: string, domain: string): Promise<void>;
}

// ─── Netlify target (extracts today's behavior) ──────────────────────────────

const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
const NETLIFY_API = "https://api.netlify.com/api/v1";
// Netlify's documented anycast load-balancer IPs for apex domains.
const NETLIFY_APEX_IPS = ["75.2.60.5", "99.83.190.102"];

function siteName(projectId: string): string {
  return `lifemark-${projectId.slice(0, 12)}`;
}

async function netlify<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if (!NETLIFY_TOKEN) throw new Error("NETLIFY_AUTH_TOKEN not configured");
  const res = await fetch(`${NETLIFY_API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${NETLIFY_TOKEN}`, "Content-Type": "application/json", ...opts.headers },
  });
  if (!res.ok) throw new Error(`Netlify ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

class NetlifyHostingTarget implements HostingTarget {
  readonly id = "netlify" as const;
  apexARecords(): string[] {
    return NETLIFY_APEX_IPS;
  }
  subdomainCname(projectId: string): string {
    return `${siteName(projectId)}.netlify.app`;
  }
  async attachHostname(projectId: string, domain: string): Promise<void> {
    if (!NETLIFY_TOKEN) return; // no-op in local mode (parity with current route)
    const sites = await netlify<Array<{ id: string; name: string }>>(
      `/sites?name=${encodeURIComponent(siteName(projectId))}`,
    );
    const site = sites.find((s) => s.name === siteName(projectId));
    if (site) await netlify(`/sites/${site.id}/aliases`, { method: "POST", body: JSON.stringify({ alias: domain }) });
  }
  async detachHostname(projectId: string, domain: string): Promise<void> {
    if (!NETLIFY_TOKEN) return;
    const sites = await netlify<Array<{ id: string; name: string }>>(
      `/sites?name=${encodeURIComponent(siteName(projectId))}`,
    );
    const site = sites.find((s) => s.name === siteName(projectId));
    if (site) {
      await netlify(`/sites/${site.id}/aliases/${encodeURIComponent(domain)}`, { method: "DELETE" }).catch(() => {});
    }
  }
}

/** Platform-owned edge (P3) — Cloudflare for SaaS / own LB + ACME. Stub. */
class PlatformHostingTarget implements HostingTarget {
  readonly id = "platform" as const;
  apexARecords(): string[] {
    return (process.env.PLATFORM_APEX_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  }
  subdomainCname(projectId: string): string {
    return `${siteName(projectId)}.${process.env.PLATFORM_APP_DOMAIN ?? "lifemarkai.app"}`;
  }
  async attachHostname(): Promise<void> {
    /* TODO P3: Cloudflare for SaaS custom_hostnames + ACME */
  }
  async detachHostname(): Promise<void> {
    /* TODO P3 */
  }
}

export function getHostingTarget(): HostingTarget {
  if (NETLIFY_TOKEN) return new NetlifyHostingTarget();
  if (process.env.PLATFORM_APEX_IPS) return new PlatformHostingTarget();
  return new NetlifyHostingTarget(); // default; attach no-ops without a token
}

// ─── target-aware verification ────────────────────────────────────────────────

export interface VerifyResult {
  domain: string;
  pointsAtTarget: boolean;
  ownershipVerified: boolean;
  live: boolean;
  resolved: { a?: string[]; cname?: string[]; txt?: string[] };
  expected: { aRecords: string[]; cname: string; txtName: string; txtValue: string };
  message: string;
}

function isApex(domain: string): boolean {
  return domain.split(".").length === 2;
}

/**
 * Verify a domain points at OUR hosting target AND proves ownership via a TXT
 * token. Replaces the resolves-to-anything check.
 */
export async function verifyDomainAgainstTarget(
  projectId: string,
  domain: string,
  verifyToken: string,
  target: HostingTarget = getHostingTarget(),
): Promise<VerifyResult> {
  const apex = isApex(domain);
  const expectedA = target.apexARecords(projectId);
  const expectedCname = target.subdomainCname(projectId);
  const txtName = `_lifemark-verify.${domain}`;

  const resolved: VerifyResult["resolved"] = {};
  let pointsAtTarget = false;

  try {
    if (apex) {
      resolved.a = await resolve4(domain);
      pointsAtTarget = resolved.a.some((ip) => expectedA.includes(ip));
    } else {
      resolved.cname = await resolveCname(domain).catch(() => []);
      pointsAtTarget = (resolved.cname ?? []).some((c) => c.replace(/\.$/, "") === expectedCname);
      // Some providers flatten CNAMEs to A records — accept apex IPs too.
      if (!pointsAtTarget) {
        resolved.a = await resolve4(domain).catch(() => []);
        pointsAtTarget = (resolved.a ?? []).some((ip) => expectedA.includes(ip));
      }
    }
  } catch {
    /* unresolved → pointsAtTarget stays false */
  }

  let ownershipVerified = false;
  try {
    const txt = (await resolveTxt(txtName)).map((chunks) => chunks.join(""));
    resolved.txt = txt;
    ownershipVerified = txt.includes(verifyToken);
  } catch {
    /* no TXT yet */
  }

  const live = pointsAtTarget && ownershipVerified;
  return {
    domain,
    pointsAtTarget,
    ownershipVerified,
    live,
    resolved,
    expected: { aRecords: expectedA, cname: expectedCname, txtName, txtValue: verifyToken },
    message: live
      ? "Domain points at the hosting target and ownership is verified. SSL will provision shortly."
      : !pointsAtTarget
        ? "Domain does not yet point at the hosting target — check the A/CNAME records."
        : "DNS points correctly; waiting on the TXT ownership record to propagate.",
  };
}

/** DNS records to show the user (BYO) or auto-create (purchased). */
export function dnsRecordsForDomain(
  projectId: string,
  domain: string,
  verifyToken: string,
  target: HostingTarget = getHostingTarget(),
): Array<{ type: string; name: string; value: string }> {
  const apex = isApex(domain);
  const base = apex
    ? target.apexARecords(projectId).map((ip) => ({ type: "A", name: "@", value: ip }))
    : [{ type: "CNAME", name: domain.split(".")[0], value: target.subdomainCname(projectId) }];
  return [...base, { type: "TXT", name: "_lifemark-verify", value: verifyToken }];
}
