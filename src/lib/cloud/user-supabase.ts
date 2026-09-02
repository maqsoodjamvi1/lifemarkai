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

async function userMgmtFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  const isMultipart = typeof FormData !== "undefined" && init?.body instanceof FormData;
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(isMultipart ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
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

/** Project ref from a standard `https://<ref>.supabase.co` URL. */
export function supabaseRefFromProjectUrl(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Run SQL on a user's own Supabase project using their OAuth Management token. */
export async function queryUserSupabaseSql<T = Record<string, unknown>>(
  accessToken: string,
  ref: string,
  query: string,
): Promise<{ ok: boolean; rows: T[]; error?: string }> {
  try {
    const res = await userMgmtFetch(accessToken, `/projects/${ref}/database/query`, {
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

export type UserEdgeFunction = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE" | "DEPLOYING";
  created_at: string;
  updated_at: string;
};

export async function listUserEdgeFunctions(
  accessToken: string,
  ref: string,
): Promise<{ ok: boolean; functions: UserEdgeFunction[]; error?: string }> {
  try {
    const res = await userMgmtFetch(accessToken, `/projects/${ref}/functions`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, functions: [], error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    const functions = (await res.json()) as UserEdgeFunction[];
    return { ok: true, functions: Array.isArray(functions) ? functions : [] };
  } catch (error) {
    return { ok: false, functions: [], error: error instanceof Error ? error.message : "request failed" };
  }
}

export async function deployUserEdgeFunction(
  accessToken: string,
  ref: string,
  input: { slug: string; name: string; code: string; verifyJwt?: boolean },
): Promise<{ ok: boolean; function?: UserEdgeFunction; error?: string }> {
  try {
    const form = new FormData();
    form.append(
      "metadata",
      JSON.stringify({
        name: input.name,
        entrypoint_path: "index.ts",
        verify_jwt: input.verifyJwt ?? true,
      }),
    );
    form.append("file", new Blob([input.code], { type: "application/typescript" }), "index.ts");
    const res = await userMgmtFetch(
      accessToken,
      `/projects/${ref}/functions/deploy?slug=${encodeURIComponent(input.slug)}`,
      { method: "POST", body: form },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 500)}` };
    }
    return { ok: true, function: (await res.json()) as UserEdgeFunction };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "request failed" };
  }
}
