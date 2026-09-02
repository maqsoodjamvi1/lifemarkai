/**
 * Resolve which backend the generated app uses: Lifemark Cloud, linked
 * Supabase (env keys), or none. Shared by Database and Storage routes so
 * they never talk to the platform Postgres.
 */
import type { createClient } from "@/lib/supabase/server";
import { ENV_FILE_PATH, parseEnvFile } from "@/lib/project/env-file";
import { getOrRefreshGatewayToken } from "../oauth/gateway-tokens.ts";
import { supabaseRefFromProjectUrl } from "./user-supabase.ts";
import { getManagedProjectKeys, managedProjectUrl } from "./management.ts";

export type AppBackend =
  | { kind: "cloud"; ref: string }
  | { kind: "supabase"; url: string; key: string; rls: boolean }
  | { kind: "none" };

/** Pure: env map from the app's `.env.local` → linked Supabase or none. */
export function backendFromEnvVars(vars: Record<string, string>): Extract<AppBackend, { kind: "supabase" | "none" }> {
  const url = (vars.VITE_SUPABASE_URL ?? vars.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const serviceKey = (vars.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const anonKey = (vars.VITE_SUPABASE_ANON_KEY ?? vars.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const key = serviceKey || anonKey;
  if (/^https:\/\/[\w.-]+/.test(url) && key) {
    return { kind: "supabase", url, key, rls: !serviceKey };
  }
  return { kind: "none" };
}

export interface OwnedCloudProject {
  id: string;
  user_id: string;
  environment: string;
  cloud_enabled: boolean;
  cloud_project_ref: string | null;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function resolveAppBackend(
  supabase: Supabase,
  project: OwnedCloudProject,
): Promise<AppBackend> {
  if (project.cloud_enabled && project.cloud_project_ref) {
    return { kind: "cloud", ref: project.cloud_project_ref };
  }
  const { data: envRow } = await supabase
    .from("project_files")
    .select("content")
    .eq("project_id", project.id)
    .eq("path", ENV_FILE_PATH)
    .maybeSingle();
  const vars = parseEnvFile(envRow?.content ?? "");
  return backendFromEnvVars(vars);
}

/**
 * User OAuth + project ref for a linked (non-Lifemark-Cloud) Supabase app.
 * Null when Cloud is the backend, env is missing, or the user has not connected
 * the Supabase connector.
 */
export async function resolveLinkedSupabaseManagement(
  supabase: Supabase,
  userId: string,
  project: OwnedCloudProject,
): Promise<{ ref: string; accessToken: string } | null> {
  const backend = await resolveAppBackend(supabase, project);
  if (backend.kind !== "supabase") return null;
  const ref = supabaseRefFromProjectUrl(backend.url);
  if (!ref) return null;
  const accessToken = await getOrRefreshGatewayToken(supabase, userId, "supabase");
  if (!accessToken) return null;
  return { ref, accessToken };
}

export async function resolveStorageHttp(
  supabase: Supabase,
  project: OwnedCloudProject,
): Promise<
  | { ok: true; url: string; key: string; backend: "cloud" | "supabase"; rls: boolean }
  | { ok: false; backend: "none"; error: string }
> {
  const backend = await resolveAppBackend(supabase, project);
  if (backend.kind === "none") {
    return { ok: false, backend: "none", error: "No backend connected. Enable Cloud or link a Supabase project." };
  }
  if (backend.kind === "supabase") {
    return { ok: true, url: backend.url, key: backend.key, backend: "supabase", rls: backend.rls };
  }
  const keys = await getManagedProjectKeys(backend.ref);
  const key = keys.serviceKey || keys.anonKey;
  if (!key) {
    return { ok: false, backend: "none", error: "Could not read Storage API keys for this Cloud project." };
  }
  return {
    ok: true,
    url: managedProjectUrl(backend.ref),
    key,
    backend: "cloud",
    rls: !keys.serviceKey,
  };
}

export function storageHeaders(key: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}
