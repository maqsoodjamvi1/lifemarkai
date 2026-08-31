/**
 * Supabase Management API calls made with a USER's own OAuth access token
 * (src/routes/api/oauth/{start,callback}/$connector.ts, connector
 * "supabase") — for a user linking an EXISTING Supabase project of theirs.
 *
 * Deliberately separate from src/lib/cloud/management.ts, which calls the
 * same Management API but with the platform's own SUPABASE_MANAGEMENT_TOKEN
 * to provision brand-new, platform-owned projects for Lifemark Cloud. Mixing
 * the two call sites together would make it easy to accidentally use the
 * platform's token for a user-initiated action (or vice versa) — the
 * separate module makes "whose credential is this call using" visible at
 * the import site.
 */

const API_BASE = "https://api.supabase.com/v1";

export interface UserManagedProject {
  ref: string;
  name: string;
  region: string;
  status: string;
  organization_id: string;
}

async function userMgmtFetch(accessToken: string, path: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
}

/** List every Supabase project the connected account can see, across all their orgs. */
export async function listUserSupabaseProjects(accessToken: string): Promise<{
  ok: boolean;
  projects: UserManagedProject[];
  error?: string;
}> {
  try {
    const res = await userMgmtFetch(accessToken, "/projects");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, projects: [], error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    const json = (await res.json()) as Array<{ id: string; name: string; region: string; status: string; organization_id: string }>;
    return {
      ok: true,
      projects: (Array.isArray(json) ? json : []).map((p) => ({
        ref: p.id,
        name: p.name,
        region: p.region,
        status: p.status,
        organization_id: p.organization_id,
      })),
    };
  } catch (error) {
    return { ok: false, projects: [], error: error instanceof Error ? error.message : "request failed" };
  }
}

/** Fetch the anon + service_role API keys for a project the connected account owns. */
export async function getUserSupabaseProjectKeys(accessToken: string, ref: string): Promise<{
  ok: boolean;
  anonKey: string | null;
  serviceKey: string | null;
  error?: string;
}> {
  try {
    const res = await userMgmtFetch(accessToken, `/projects/${ref}/api-keys`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, anonKey: null, serviceKey: null, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    const keys = (await res.json()) as Array<{ name: string; api_key: string }>;
    return {
      ok: true,
      anonKey: keys.find((k) => k.name === "anon")?.api_key ?? null,
      serviceKey: keys.find((k) => k.name === "service_role")?.api_key ?? null,
    };
  } catch (error) {
    return { ok: false, anonKey: null, serviceKey: null, error: error instanceof Error ? error.message : "request failed" };
  }
}

export function userSupabaseProjectUrl(ref: string): string {
  return `https://${ref}.supabase.co`;
}
