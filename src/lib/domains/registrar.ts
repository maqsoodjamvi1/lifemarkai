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

export type RegistrarId = "cloudflare" | "ionos" | "namecom";

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
  // Assigned in the body rather than declared as a parameter property, so the
  // file stays loadable under `node --test --experimental-strip-types`.
  public registrar: RegistrarId;

  constructor(registrar: RegistrarId, message: string) {
    super(`[${registrar}] ${message}`);
    this.registrar = registrar;
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

// ─── Name.com Registrar (Lovable's registrar of record) ───────────────────────
// Lovable registers domains through Name.com (see docs/domain-registrar-research).
// Name.com API v4 — Basic auth (username:token). Test host api.dev.name.com.
// Requires: NAMECOM_USERNAME, NAMECOM_API_TOKEN (+ optional NAMECOM_API_HOST).

class NameComRegistrar implements DomainRegistrar {
  readonly id = "namecom" as const;
  private user = process.env.NAMECOM_USERNAME;
  private token = process.env.NAMECOM_API_TOKEN;
  private base = (process.env.NAMECOM_API_HOST || "https://api.name.com") + "/v4";

  isConfigured(): boolean {
    return Boolean(this.user && this.token);
  }

  private headers(): HeadersInit {
    const auth = Buffer.from(`${this.user}:${this.token}`).toString("base64");
    return { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
  }

  async search(query: string, years = 1): Promise<DomainSuggestion[]> {
    if (!this.isConfigured()) return [];
    // checkAvailability takes exact domain(s); if a bare keyword is passed we
    // check the .com. Name.com's separate "search" endpoint returns suggestions.
    const domainNames = query.includes(".") ? [query] : [`${query}.com`];
    type NCResult = {
      results?: Array<{ domainName: string; purchasable?: boolean; premium?: boolean; purchasePrice?: number }>;
    };
    const data = await httpJson<NCResult>(
      `${this.base}/domains:checkAvailability`,
      { method: "POST", headers: this.headers(), body: JSON.stringify({ domainNames }) },
      this.id,
    ).catch(() => ({ results: [] }) as NCResult);

    return (data.results ?? []).map((r) => ({
      domain: r.domainName,
      available: Boolean(r.purchasable),
      priceCents: Math.round((r.purchasePrice ?? 0) * 100) * years,
      currency: "USD" as const,
      years,
      premium: r.premium,
    }));
  }

  async register(domain: string, contact: RegistrantContact, years: number): Promise<RegisterResult> {
    if (!this.isConfigured()) {
      return { ok: false, domain, registrar: this.id, error: "Name.com registrar not configured" };
    }
    try {
      // Confirm the current purchase price (Name.com requires it on register).
      const [avail] = await this.search(domain, 1);
      const purchasePrice = avail && avail.available ? avail.priceCents / 100 : undefined;
      const nc = toNameComContact(contact);
      type NCReg = { domain?: { domainName?: string; expireDate?: string }; order?: number };
      const data = await httpJson<NCReg>(
        `${this.base}/domains`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            domain: { domainName: domain, contacts: { registrant: nc, admin: nc, tech: nc, billing: nc } },
            purchasePrice,
            years,
          }),
        },
        this.id,
      );
      return {
        ok: true,
        domain,
        registrar: this.id,
        registrationRef: data.order != null ? String(data.order) : undefined,
        expiresAt: data.domain?.expireDate,
      };
    } catch (err) {
      return { ok: false, domain, registrar: this.id, error: errMsg(err) };
    }
  }

  async configureDns(domain: string, records: DnsRecord[]): Promise<void> {
    if (!this.isConfigured()) throw new RegistrarError(this.id, "not configured");
    for (const rec of records) {
      await httpJson(
        `${this.base}/domains/${encodeURIComponent(domain)}/records`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            host: rec.name === "@" ? "" : rec.name,
            type: rec.type,
            answer: rec.value,
            ttl: rec.ttl ?? 3600,
            priority: rec.priority,
          }),
        },
        this.id,
      );
    }
  }

  async renew(domain: string, years: number): Promise<void> {
    if (!this.isConfigured()) throw new RegistrarError(this.id, "not configured");
    await httpJson(
      `${this.base}/domains/${encodeURIComponent(domain)}:renew`,
      { method: "POST", headers: this.headers(), body: JSON.stringify({ years }) },
      this.id,
    );
  }
}

function toNameComContact(c: RegistrantContact): Record<string, unknown> {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    companyName: c.organization ?? "",
    address1: c.address1,
    city: c.city,
    state: c.state,
    zip: c.postalCode,
    country: c.country,
    phone: c.phone,
    email: c.email,
  };
}

// ─── factory ──────────────────────────────────────────────────────────────────

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Default registrar. Honors an explicit id or the DOMAIN_REGISTRAR env var;
 * otherwise auto-selects the first configured driver (Name.com preferred — it's
 * the registrar of record we mirror from Lovable), then Cloudflare, then IONOS.
 */
export function getRegistrar(id?: RegistrarId): DomainRegistrar {
  const explicit = id ?? (process.env.DOMAIN_REGISTRAR as RegistrarId | undefined);
  if (explicit) {
    switch (explicit) {
      case "namecom": return new NameComRegistrar();
      case "ionos": return new IonosRegistrar();
      case "cloudflare": return new CloudflareRegistrar();
    }
  }
  const namecom = new NameComRegistrar();
  if (namecom.isConfigured()) return namecom;
  const cloudflare = new CloudflareRegistrar();
  if (cloudflare.isConfigured()) return cloudflare;
  const ionos = new IonosRegistrar();
  if (ionos.isConfigured()) return ionos;
  return namecom; // returns a not-configured driver that degrades gracefully
}

/** True when at least one registrar driver has credentials configured. */
export function isPurchaseEnabled(): boolean {
  return (
    new NameComRegistrar().isConfigured() ||
    new CloudflareRegistrar().isConfigured() ||
    new IonosRegistrar().isConfigured()
  );
}
