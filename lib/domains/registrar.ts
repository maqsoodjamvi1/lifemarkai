/**
 * Domain registrar abstraction (Lovable-parity in-product domain purchase).
 * Part of the Lovable-parity domains and hosting flow.
 *
 * One interface, swappable drivers. Cloudflare Registrar is the default
 * (at-cost pricing, clean API); IONOS is provided for parity with Lovable.
 * Credentials live server-side only (env), never sent to the client — same
 * discipline as the connector gateway.
 *
 * All network calls are wrapped so a missing/!configured driver degrades
 * gracefully (returns `configured: false`) instead of throwing — mirroring how
 * the existing Netlify domain path no-ops when NETLIFY_AUTH_TOKEN is absent.
 */

export type RegistrarId = "cloudflare" | "ionos";

export interface DomainSuggestion {
  domain: string;
  available: boolean;
  /** Price for `years` of registration, in USD cents (registrar price). */
  priceCents: number;
  currency: "USD";
  years: number;
  premium?: boolean;
}

export interface RegistrantContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO-3166 alpha-2
  organization?: string;
}

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME" | "TXT" | "MX";
  /** Subdomain or "@" for apex. */
  name: string;
  value: string;
  ttl?: number;
  priority?: number; // MX
}

export interface RegisterResult {
  ok: boolean;
  domain: string;
  registrar: RegistrarId;
  /** Registrar-side order/registration id, for reconciliation. */
  registrationRef?: string;
  expiresAt?: string; // ISO
  error?: string;
}

export interface DomainRegistrar {
  readonly id: RegistrarId;
  /** True when env credentials are present. */
  isConfigured(): boolean;
  /** Availability + price for a query (exact domain or keyword). */
  search(query: string, years?: number): Promise<DomainSuggestion[]>;
  /** Register a domain to a contact for N years. */
  register(domain: string, contact: RegistrantContact, years: number): Promise<RegisterResult>;
  /** Write DNS records on the registrar's nameservers. */
  configureDns(domain: string, records: DnsRecord[]): Promise<void>;
  /** Optional renewal. */
  renew?(domain: string, years: number): Promise<void>;
}

// ─── helpers ────────────────────────────────────────────────────────────────

class RegistrarError extends Error {
  constructor(public registrar: RegistrarId, message: string) {
    super(`[${registrar}] ${message}`);
    this.name = "RegistrarError";
  }
}

async function httpJson<T>(url: string, init: RequestInit, registrar: RegistrarId): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new RegistrarError(registrar, `${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ─── Cloudflare Registrar (default) ───────────────────────────────────────────
// Docs: Cloudflare Registrar API (registrar) + Cloudflare DNS API (records).
// Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID. Per-domain DNS writes
// need the zone id; created automatically when a domain is added to the account.

class CloudflareRegistrar implements DomainRegistrar {
  readonly id = "cloudflare" as const;
  private token = process.env.CLOUDFLARE_API_TOKEN;
  private accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  private base = "https://api.cloudflare.com/client/v4";

  isConfigured(): boolean {
    return Boolean(this.token && this.accountId);
  }

  private headers(): HeadersInit {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
  }

  async search(query: string, years = 1): Promise<DomainSuggestion[]> {
    if (!this.isConfigured()) return [];
    // Cloudflare Registrar exposes availability + price under the account.
    type CFResp = {
      result?: Array<{ name: string; available: boolean; can_register?: boolean; current_registrar_fee?: number }>;
    };
    const data = await httpJson<CFResp>(
      `${this.base}/accounts/${this.accountId}/registrar/domains/check?domain=${encodeURIComponent(query)}`,
      { headers: this.headers() },
      this.id,
    ).catch(() => ({ result: [] }) as CFResp);

    return (data.result ?? []).map((r) => ({
      domain: r.name,
      available: Boolean(r.available ?? r.can_register),
      priceCents: Math.round((r.current_registrar_fee ?? 0) * 100) * years,
      currency: "USD" as const,
      years,
    }));
  }

  async register(domain: string, contact: RegistrantContact, years: number): Promise<RegisterResult> {
    if (!this.isConfigured()) {
      return { ok: false, domain, registrar: this.id, error: "Cloudflare registrar not configured" };
    }
    try {
      type CFReg = { result?: { id?: string; expires_at?: string } };
      const data = await httpJson<CFReg>(
        `${this.base}/accounts/${this.accountId}/registrar/domains/${encodeURIComponent(domain)}`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ years, contact: toCloudflareContact(contact) }),
        },
        this.id,
      );
      return {
        ok: true,
        domain,
        registrar: this.id,
        registrationRef: data.result?.id,
        expiresAt: data.result?.expires_at,
      };
    } catch (err) {
      return { ok: false, domain, registrar: this.id, error: errMsg(err) };
    }
  }

  async configureDns(domain: string, records: DnsRecord[]): Promise<void> {
    if (!this.isConfigured()) throw new RegistrarError(this.id, "not configured");
    const zoneId = await this.zoneId(domain);
    for (const rec of records) {
      await httpJson(
        `${this.base}/zones/${zoneId}/dns_records`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            type: rec.type,
            name: rec.name === "@" ? domain : `${rec.name}.${domain}`,
            content: rec.value,
            ttl: rec.ttl ?? 3600,
            priority: rec.priority,
            proxied: false, // grey-cloud so SSL provisioning on our target works
          }),
        },
        this.id,
      );
    }
  }

  private async zoneId(domain: string): Promise<string> {
    type CFZones = { result?: Array<{ id: string }> };
    const data = await httpJson<CFZones>(
      `${this.base}/zones?name=${encodeURIComponent(domain)}`,
      { headers: this.headers() },
      this.id,
    );
    const id = data.result?.[0]?.id;
    if (!id) throw new RegistrarError(this.id, `no zone for ${domain}`);
    return id;
  }
}

function toCloudflareContact(c: RegistrantContact): Record<string, unknown> {
  return {
    first_name: c.firstName,
    last_name: c.lastName,
    email: c.email,
    phone: c.phone,
    address: c.address1,
    city: c.city,
    state: c.state,
    zipcode: c.postalCode,
    country: c.country,
    organization: c.organization ?? "",
  };
}

// ─── IONOS Registrar (parity with Lovable) ────────────────────────────────────
// Requires: IONOS_API_KEY (public.secret form per IONOS Developer API).

class IonosRegistrar implements DomainRegistrar {
  readonly id = "ionos" as const;
  private key = process.env.IONOS_API_KEY;
  private base = "https://api.hosting.ionos.com/domains/v1";

  isConfigured(): boolean {
    return Boolean(this.key);
  }

  private headers(): HeadersInit {
    return { "X-API-Key": this.key ?? "", "Content-Type": "application/json" };
  }

  async search(query: string, years = 1): Promise<DomainSuggestion[]> {
    if (!this.isConfigured()) return [];
    type IonosResp = Array<{ name: string; available: boolean; price?: { amount: number } }>;
    const data = await httpJson<IonosResp>(
      `${this.base}/domain-availabilities?domain=${encodeURIComponent(query)}`,
      { headers: this.headers() },
      this.id,
    ).catch(() => [] as IonosResp);
    return data.map((r) => ({
      domain: r.name,
      available: r.available,
      priceCents: Math.round((r.price?.amount ?? 0) * 100) * years,
      currency: "USD" as const,
      years,
    }));
  }

  async register(domain: string, contact: RegistrantContact, years: number): Promise<RegisterResult> {
    if (!this.isConfigured()) {
      return { ok: false, domain, registrar: this.id, error: "IONOS registrar not configured" };
    }
    try {
      type IonosReg = { id?: string; expiresAt?: string };
      const data = await httpJson<IonosReg>(
        `${this.base}/domain-orders`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ domain, period: years, contact }),
        },
        this.id,
      );
      return { ok: true, domain, registrar: this.id, registrationRef: data.id, expiresAt: data.expiresAt };
    } catch (err) {
      return { ok: false, domain, registrar: this.id, error: errMsg(err) };
    }
  }

  async configureDns(domain: string, records: DnsRecord[]): Promise<void> {
    if (!this.isConfigured()) throw new RegistrarError(this.id, "not configured");
    await httpJson(
      `${this.base}/dns/${encodeURIComponent(domain)}/records`,
      {
        method: "PUT",
        headers: this.headers(),
        body: JSON.stringify(
          records.map((r) => ({
            type: r.type,
            name: r.name,
            content: r.value,
            ttl: r.ttl ?? 3600,
            prio: r.priority,
          })),
        ),
      },
      this.id,
    );
  }
}

// ─── factory ──────────────────────────────────────────────────────────────────

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Default registrar from env, falling back to Cloudflare. */
export function getRegistrar(id?: RegistrarId): DomainRegistrar {
  const choice = id ?? (process.env.DOMAIN_REGISTRAR as RegistrarId | undefined) ?? "cloudflare";
  switch (choice) {
    case "ionos":
      return new IonosRegistrar();
    case "cloudflare":
    default:
      return new CloudflareRegistrar();
  }
}

/** True when at least one registrar driver has credentials configured. */
export function isPurchaseEnabled(): boolean {
  return new CloudflareRegistrar().isConfigured() || new IonosRegistrar().isConfigured();
}
