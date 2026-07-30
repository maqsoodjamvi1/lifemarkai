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

/** Management operations that don't create projects only need an API token. */
export function isManagementTokenConfigured(): boolean {
  return Boolean(process.env.SUPABASE_MANAGEMENT_TOKEN);
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
  const isMultipart = typeof FormData !== "undefined" && init?.body instanceof FormData;
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_MANAGEMENT_TOKEN}`,
      ...(isMultipart ? {} : { "Content-Type": "application/json" }),
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

export interface ManagedEdgeFunction {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE" | "DEPLOYING";
  created_at: string;
  updated_at: string;
  version?: number;
  verify_jwt?: boolean;
}

/** List deployed Edge Functions for a managed project. */
export async function listManagedEdgeFunctions(ref: string): Promise<{
  ok: boolean;
  functions: ManagedEdgeFunction[];
  error?: string;
}> {
  try {
    const res = await mgmtFetch(`/projects/${ref}/functions`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, functions: [], error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    const functions = await res.json() as ManagedEdgeFunction[];
    return { ok: true, functions: Array.isArray(functions) ? functions : [] };
  } catch (error) {
    return { ok: false, functions: [], error: error instanceof Error ? error.message : "request failed" };
  }
}

/**
 * Deploy a Deno Edge Function through Supabase's Management API. The API
 * bundles the submitted source and creates or updates the supplied slug.
 */
export async function deployManagedEdgeFunction(
  ref: string,
  input: { slug: string; name: string; code: string; verifyJwt?: boolean },
): Promise<{ ok: boolean; function?: ManagedEdgeFunction; error?: string }> {
  try {
    const form = new FormData();
    form.append("metadata", JSON.stringify({
      name: input.name,
      entrypoint_path: "index.ts",
      verify_jwt: input.verifyJwt ?? true,
    }));
    form.append("file", new Blob([input.code], { type: "application/typescript" }), "index.ts");

    const res = await mgmtFetch(
      `/projects/${ref}/functions/deploy?slug=${encodeURIComponent(input.slug)}`,
      { method: "POST", body: form },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 500)}` };
    }
    return { ok: true, function: await res.json() as ManagedEdgeFunction };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "request failed" };
  }
}

/** Delete a managed project (used when Cloud provisioning is rolled back). */
export async function deleteManagedProject(ref: string): Promise<boolean> {
  const res = await mgmtFetch(`/projects/${ref}`, { method: "DELETE" });
  return res.ok;
}

/**
 * Pause a managed project's real infrastructure (Supabase Management API).
 * Best-effort: local-mode Cloud (no management token) just flips the flag.
 */
export async function pauseManagedProject(ref: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await mgmtFetch(`/projects/${ref}/pause`, { method: "POST" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request failed" };
  }
}

/**
 * Restore (wake) a paused managed project. The project takes a few minutes
 * to come back; poll getManagedProjectStatus for health.
 */
export async function restoreManagedProject(ref: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await mgmtFetch(`/projects/${ref}/restore`, { method: "POST" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "request failed" };
  }
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
 * Run SQL on a managed project's Postgres and return the result rows.
 * Same Management API endpoint as runManagedSql, but parses the JSON row
 * payload — used by the slow-query finder and the Jobs (pg_cron) panel.
 */
export async function queryManagedSql<T = Record<string, unknown>>(
  ref: string,
  query: string
): Promise<{ ok: boolean; rows: T[]; error?: string }> {
  try {
    const res = await mgmtFetch(`/projects/${ref}/database/query`, {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, rows: [], error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    const data = (await res.json().catch(() => null)) as unknown;
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { result?: unknown[] } | null)?.result)
        ? (data as { result: unknown[] }).result
        : [];
    return { ok: true, rows: rows as T[] };
  } catch (err) {
    return { ok: false, rows: [], error: err instanceof Error ? err.message : "request failed" };
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
