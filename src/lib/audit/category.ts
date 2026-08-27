/**
 * `action` string -> coarse category. Pure, dependency-free, and therefore the
 * ONE copy both sides can import.
 *
 * log.ts is explicitly server-only — it constructs the Supabase admin client —
 * so the audit-logs page could not import this and had reimplemented it, under
 * a comment asking for it to be kept in sync by hand. Two copies of a mapping
 * that decides how events are filtered in the UI: drift there shows up as
 * events quietly missing from a filter, which is the kind of bug nobody reports
 * because the page still looks fine.
 *
 * Splitting the pure function out costs nothing and removes the hand-sync.
 */
export type AuditCategory =
  | "auth" | "member" | "project" | "billing" | "config" | "security" | "other";

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
