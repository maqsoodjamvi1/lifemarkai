/**
 * Server-side audit-log helper (enterprise beachhead — immutable workspace
 * audit trail). Writes append-only entries to the `audit_logs` table
 * (migration 008 + 077). Never throws into the caller's request path — audit
 * logging must never break the action it records.
 *
 * Server-only: uses the admin client. Do NOT import from client components.
 */

import { createAdminClient } from "../supabase/admin.ts";
import type { Json } from "../../types/database.ts";

/** Canonical audit action names use a `category.verb` shape. */
export type AuditCategory = "auth" | "member" | "project" | "billing" | "config" | "security" | "other";

export interface AuditEventInput {
  userId: string | null;
  /** e.g. "project.create", "member.invite", "auth.sso.login", "config.update" */
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  teamId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Derive the coarse category from an `action` string ("project.create" → "project"). */
export function auditCategory(action: string): AuditCategory {
  const head = (action.split(".")[0] || "").toLowerCase();
  if (head === "auth" || head === "sso" || head === "scim" || head === "session") return "auth";
  if (head === "member" || head === "invite" || head === "collaborator" || head === "team") return "member";
  if (head === "project" || head === "file" || head === "deploy" || head === "build") return "project";
  if (head === "billing" || head === "subscription" || head === "credit" || head === "plan") return "billing";
  if (head === "config" || head === "settings" || head === "flag" || head === "env") return "config";
  if (head === "security" || head === "scan") return "security";
  return "other";
}

/** Pull best-effort client IP + user agent from request headers. */
export function auditContextFromHeaders(headers: Headers): { ip: string | null; userAgent: string | null } {
  const fwd = headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : headers.get("x-real-ip"))?.trim() || null;
  const userAgent = headers.get("user-agent");
  return { ip, userAgent: userAgent ? userAgent.slice(0, 512) : null };
}

/**
 * Record an audit event. Fire-and-forget safe: resolves to true on success,
 * false on any failure (logged to console, never re-thrown).
 */
export async function logAuditEvent(event: AuditEventInput): Promise<boolean> {
  try {
    const supabase = await createAdminClient();
    // Direct insert (not the log_audit_event RPC) so we can persist ip/user_agent.
    const { error } = await supabase.from("audit_logs").insert({
      user_id: event.userId,
      team_id: event.teamId ?? null,
      action: event.action,
      resource_type: event.resourceType ?? null,
      resource_id: event.resourceId ?? null,
      metadata: (event.metadata ?? null) as Json,
      ip_address: event.ip ?? null,
      user_agent: event.userAgent ?? null,
    });
    if (error) {
      console.warn("[audit] failed to write event", event.action, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[audit] logAuditEvent threw", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Convenience: log an event using a NextRequest-like object for ip/user-agent. */
export async function logAuditFromRequest(
  req: { headers: Headers },
  event: Omit<AuditEventInput, "ip" | "userAgent">,
): Promise<boolean> {
  const { ip, userAgent } = auditContextFromHeaders(req.headers);
  return logAuditEvent({ ...event, ip, userAgent });
}
