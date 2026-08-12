/**
 * Server-side connector execution + write-approval permissions.
 *
 * Lovable parity (Jul 9 2026 changelog: "Approve connector actions before
 * they run"): when the AI agent wants to perform a WRITE through an app
 * connector (send a message, create a record), the action pauses until the
 * user approves it in chat — Allow once / Always allow / Skip. Read-only
 * requests never prompt.
 *
 * Used by the agent's `connector_call` tool. The runtime connector-proxy
 * (called by deployed apps) is intentionally NOT gated — pausing a live app's
 * API traffic would break it; this gate is for agent-initiated actions only.
 *
 * Permission storage — `projects.metadata` JSONB:
 *   metadata.connector_permissions = { [connectorId]: "always" | "never" }
 *   metadata.connector_once       = { [connectorId]: "<ISO expiry>" }  // one-shot, 10 min
 */
import {
CONNECTOR_REGISTRY,
resolveConnectorBaseUrl,
} from "@/lib/integrations/connector-registry";
import { ENV_FILE_PATH,parseEnvFile } from "../project/env-file.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const ONCE_GRANT_TTL_MS = 10 * 60 * 1000;

export type ConnectorDecision = "always" | "never" | "once";

interface ProjectMetaShape {
  connector_permissions?: Record<string, "always" | "never">;
  connector_once?: Record<string, string>;
  [k: string]: unknown;
}

/** Pure: decide whether a write may proceed given project metadata. */
export function decideConnectorWrite(
  metadata: unknown,
  connector: string,
  now: Date = new Date(),
): "allow" | "deny" | "ask" {
  const meta = (metadata ?? {}) as ProjectMetaShape;
  const standing = meta.connector_permissions?.[connector];
  if (standing === "always") return "allow";
  if (standing === "never") return "deny";
  const onceExpiry = meta.connector_once?.[connector];
  if (onceExpiry && new Date(onceExpiry).getTime() > now.getTime()) return "allow";
  return "ask";
}

/** Persist a decision. "once" grants a 10-minute single-connector window
 *  (consumed implicitly by expiry rather than per-call bookkeeping — the
 *  agent retry lands well inside it, matching Lovable's "Allow once" UX). */
export async function saveConnectorDecision(
  supabase: SupabaseLike,
  projectId: string,
  connector: string,
  decision: ConnectorDecision,
): Promise<void> {
  const { data: project } = await supabase
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .single();
  const meta = ((project?.metadata ?? {}) as ProjectMetaShape) || {};
  const permissions = { ...(meta.connector_permissions ?? {}) };
  const once = { ...(meta.connector_once ?? {}) };
  if (decision === "once") {
    delete permissions[connector];
    once[connector] = new Date(Date.now() + ONCE_GRANT_TTL_MS).toISOString();
  } else {
    permissions[connector] = decision;
    delete once[connector];
  }
  await supabase
    .from("projects")
    .update({ metadata: { ...meta, connector_permissions: permissions, connector_once: once } })
    .eq("id", projectId);
}

export interface ConnectorCallArgs {
  connector: string;
  path: string;
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}

export interface ConnectorCallResult {
  ok: boolean;
  status?: number;
  /** Truncated upstream response (or error / approval payload) */
  result: string;
  approval_required?: boolean;
}

/** List connectors that have all required env keys configured for a project. */
export function configuredConnectorIds(env: Record<string, string>): string[] {
  return Object.entries(CONNECTOR_REGISTRY)
    .filter(([, spec]) => spec.requiredEnv.every((k) => !!env[k]))
    .map(([id]) => id);
}

/**
 * Execute a connector API call server-side (agent tool backend).
 * Writes are gated by decideConnectorWrite; blocked writes return an
 * approval_required observation instead of executing.
 */
export async function executeConnectorCall(
  supabase: SupabaseLike,
  projectId: string,
  projectMetadata: unknown,
  args: ConnectorCallArgs,
): Promise<ConnectorCallResult> {
  const spec = CONNECTOR_REGISTRY[args.connector?.toLowerCase?.() ?? ""];
  if (!spec) {
    return { ok: false, result: `Unknown connector "${args.connector}". Available: ${Object.keys(CONNECTOR_REGISTRY).join(", ")}` };
  }
  if (typeof args.path !== "string" || !args.path.startsWith("/") || args.path.includes("..")) {
    return { ok: false, result: "path must start with / and not contain .." };
  }
  const method = (args.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { ok: false, result: `Unsupported method ${method}` };
  }

  // Approval gate — writes only
  if (WRITE_METHODS.has(method)) {
    const decision = decideConnectorWrite(projectMetadata, args.connector.toLowerCase());
    if (decision === "deny") {
      return { ok: false, result: `The user has blocked write actions for the "${args.connector}" connector ("Never allow"). Do not retry; suggest they change it in the Connectors panel if needed.` };
    }
    if (decision === "ask") {
      return {
        ok: false,
        approval_required: true,
        result: JSON.stringify({
          approval_required: true,
          connector: args.connector.toLowerCase(),
          method,
          path: args.path,
          summary: `${method} ${args.path} via ${args.connector}`,
        }),
      };
    }
  }

  // Credentials from the project's .env (server-side only)
  const { data: envRow } = await supabase
    .from("project_files")
    .select("content")
    .eq("project_id", projectId)
    .eq("path", ENV_FILE_PATH)
    .maybeSingle();
  const env = parseEnvFile((envRow as { content?: string } | null)?.content ?? "");
  const missing = spec.requiredEnv.filter((k) => !env[k]);
  if (missing.length > 0) {
    return { ok: false, result: `Connector "${args.connector}" is not configured: missing ${missing.join(", ")}. Ask the user to add credentials in the App Connectors panel.` };
  }

  const baseUrl = resolveConnectorBaseUrl(spec, env);
  const url = new URL(baseUrl.replace(/\/$/, "") + args.path);
  for (const [k, v] of Object.entries(args.query ?? {})) url.searchParams.set(k, String(v));

  const headers: Record<string, string> = { ...spec.headers(env) };
  let upstreamBody: string | undefined;
  if (method !== "GET" && args.body !== undefined) {
    const ct = headers["Content-Type"] ?? "application/json";
    headers["Content-Type"] = ct;
    upstreamBody = typeof args.body === "string" ? args.body : ct.includes("json") ? JSON.stringify(args.body) : String(args.body);
    if (upstreamBody.length > 256 * 1024) return { ok: false, result: "Body too large (max 256 KB)" };
  }

  try {
    const upstream = await fetch(url.toString(), {
      method,
      headers,
      body: upstreamBody,
      signal: AbortSignal.timeout(25_000),
    });
    const text = await upstream.text();
    return { ok: upstream.ok, status: upstream.status, result: text.slice(0, 4000) };
  } catch (err) {
    return { ok: false, result: err instanceof Error ? err.message : "Upstream request failed" };
  }
}
