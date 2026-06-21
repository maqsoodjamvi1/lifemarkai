/**
 * Supabase Management API client — real backend provisioning for
 * Lifemark Cloud (Lovable Cloud parity).
 *
 * When SUPABASE_MANAGEMENT_TOKEN + SUPABASE_ORG_ID are set, enabling Cloud on
 * a project creates a real, dedicated Supabase project (Postgres + Auth +
 * Storage + Edge Functions) in the chosen region. Without them, Cloud runs in
 * "local mode": the project is marked active and backed by the platform's
 * existing Supabase integration (previous behaviour).
 *
 * Docs: https://supabase.com/docs/reference/api/introduction
 */

const API_BASE = "https://api.supabase.com/v1";

export function isManagementConfigured(): boolean {
  return Boolean(process.env.SUPABASE_MANAGEMENT_TOKEN && process.env.SUPABASE_ORG_ID);
}

/** Lifemark region → Supabase region slug */
const REGION_MAP: Record<string, string> = {
  "americas": "us-east-1",
  "europe": "eu-central-1",
  "asia-pacific": "ap-southeast-1",
};

interface ManagementProject {
  id: string;            // project ref
  name: string;
  region: string;
  status: string;        // COMING_UP | ACTIVE_HEALTHY | INACTIVE | ...
}

async function mgmtFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_MANAGEMENT_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function generateDbPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pass = "";
  const buf = new Uint8Array(28);
  crypto.getRandomValues(buf);
  for (const b of buf) pass += chars[b % chars.length];
  return pass;
}

/**
 * Create a dedicated Supabase project for a Lifemark Cloud project.
 * Returns the project ref; the project boots asynchronously (COMING_UP →
 * ACTIVE_HEALTHY) — poll with getManagedProjectStatus.
 */
export async function createManagedProject(opts: {
  projectId: string;
  region: string; // lifemark region
}): Promise<{ ref: string; dbPassword: string }> {
  const res = await mgmtFetch("/projects", {
    method: "POST",
    body: JSON.stringify({
      organization_id: process.env.SUPABASE_ORG_ID,
      name: `lifemark-${opts.projectId.slice(0, 18)}`,
      region: REGION_MAP[opts.region] ?? REGION_MAP["americas"],
      db_pass: generateDbPassword(),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Management API create failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as ManagementProject & { db_pass?: string };
  return { ref: json.id, dbPassword: json.db_pass ?? "" };
}

export async function getManagedProjectStatus(ref: string): Promise<{
  status: "provisioning" | "active" | "failed";
  raw: string;
}> {
  const res = await mgmtFetch(`/projects/${ref}`);
  if (!res.ok) return { status: "failed", raw: `HTTP ${res.status}` };
  const json = (await res.json()) as ManagementProject;
  if (json.status === "ACTIVE_HEALTHY") return { status: "active", raw: json.status };
  if (["COMING_UP", "UNKNOWN", "RESTORING", "UPGRADING", "PAUSING"].includes(json.status)) {
    return { status: "provisioning", raw: json.status };
  }
  return { status: "failed", raw: json.status };
}

/** Fetch the anon + service_role API keys for a managed project. */
export async function getManagedProjectKeys(ref: string): Promise<{
  anonKey: string | null;
  serviceKey: string | null;
}> {
  const res = await mgmtFetch(`/projects/${ref}/api-keys`);
  if (!res.ok) return { anonKey: null, serviceKey: null };
  const keys = (await res.json()) as Array<{ name: string; api_key: string }>;
  return {
    anonKey: keys.find((k) => k.name === "anon")?.api_key ?? null,
    serviceKey: keys.find((k) => k.name === "service_role")?.api_key ?? null,
  };
}

export function managedProjectUrl(ref: string): string {
  return `https://${ref}.supabase.co`;
}

/** Delete a managed project (used when Cloud provisioning is rolled back). */
export async function deleteManagedProject(ref: string): Promise<boolean> {
  const res = await mgmtFetch(`/projects/${ref}`, { method: "DELETE" });
  return res.ok;
}

/**
 * Run SQL on a managed project's Postgres via the Management API.
 * Used by backend auto-wiring to apply generated migrations.
 */
export async function runManagedSql(
  ref: string,
  query: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await mgmtFetch(`/projects/${ref}/database/query`, {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request failed" };
  }
}

/**
 * Configure auth redirect URLs on a managed project so login flows work on
 * the published app without manual setup (Lovable parity).
 */
export async function configureManagedAuthRedirects(
  ref: string,
  siteUrl: string,
  additionalRedirects: string[] = []
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await mgmtFetch(`/projects/${ref}/config/auth`, {
      method: "PATCH",
      body: JSON.stringify({
        site_url: siteUrl,
        uri_allow_list: [siteUrl, ...additionalRedirects].join(","),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request failed" };
  }
}

/** Lifemark instance tier → Supabase compute add-on variant.
 *  `tiny` runs on the default (nano) compute, i.e. no add-on. */
const TIER_TO_COMPUTE: Record<string, string | null> = {
  tiny: null,
  mini: "ci_micro",
  small: "ci_small",
  medium: "ci_medium",
  large: "ci_large",
};

/**
 * Apply a real compute add-on for the project's instance tier.
 * Returns { ok, note } — failures are reported, not thrown, so tier changes
 * still persist locally when the billing API rejects (e.g. free org plan).
 */
export async function setManagedComputeTier(
  ref: string,
  tier: string
): Promise<{ ok: boolean; note?: string }> {
  const variant = TIER_TO_COMPUTE[tier];
  try {
    if (variant === null) {
      // Back to default compute — remove the add-on (404 = none attached, fine)
      const res = await mgmtFetch(`/projects/${ref}/billing/addons/compute_instance`, {
        method: "DELETE",
      });
      return res.ok || res.status === 404
        ? { ok: true }
        : { ok: false, note: `HTTP ${res.status}` };
    }
    if (!variant) return { ok: false, note: `Unknown tier "${tier}"` };

    const res = await mgmtFetch(`/projects/${ref}/billing/addons`, {
      method: "PUT",
      body: JSON.stringify({ addon_type: "compute_instance", addon_variant: variant }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, note: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, note: err instanceof Error ? err.message : "request failed" };
  }
}
