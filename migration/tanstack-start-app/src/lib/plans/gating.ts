/**
 * Plan-based feature gating (Lovable-parity: features are tiered by plan).
 *
 * LifemarkAI already builds every enterprise feature, but — unlike Lovable —
 * did not gate them by plan. This is the canonical gate: it maps each gated
 * capability to the minimum plan that unlocks it, and provides server helpers
 * to enforce it in routes and derive UI state.
 *
 * Plan order: free < pro < team < enterprise. (`team` is LifemarkAI's
 * equivalent of Lovable's "Business" tier.)
 */

import type { PlanId } from "../stripe/plans.ts";
import { createAdminClient } from "../supabase/admin.ts";

export type GatedFeature =
  // Pro
  | "custom_domains" | "version_history" | "github_sync" | "remove_badge"
  | "project_monitoring" | "workspace_domains"
  // Team (≈ Lovable Business)
  | "rbac" | "member_groups" | "security_center" | "workspace_templates"
  | "internal_publish" | "sso"
  // Enterprise
  | "scim" | "audit_logs" | "design_systems" | "custom_connectors"
  | "publishing_controls" | "sharing_controls";

const PLAN_RANK: Record<PlanId, number> = { free: 0, pro: 1, team: 2, enterprise: 3 };

/** Minimum plan that unlocks each gated feature. */
export const FEATURE_MIN_PLAN: Record<GatedFeature, PlanId> = {
  // Pro
  custom_domains: "pro",
  version_history: "pro",
  github_sync: "pro",
  remove_badge: "pro",
  project_monitoring: "pro",
  workspace_domains: "pro",
  // Team (Lovable Business)
  rbac: "team",
  member_groups: "team",
  security_center: "team",
  workspace_templates: "team",
  internal_publish: "team",
  sso: "team",
  // Enterprise
  scim: "enterprise",
  audit_logs: "enterprise",
  design_systems: "enterprise",
  custom_connectors: "enterprise",
  publishing_controls: "enterprise",
  sharing_controls: "enterprise",
};

/** Does `plan` unlock `feature`? Pure — safe on the client. */
export function planAllows(plan: PlanId | null | undefined, feature: GatedFeature): boolean {
  const p = plan ?? "free";
  return (PLAN_RANK[p] ?? 0) >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}

/** The minimum plan label for UI upsell copy (e.g. "Upgrade to Team"). */
export function requiredPlanLabel(feature: GatedFeature): string {
  const p = FEATURE_MIN_PLAN[feature];
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** Fetch a user's current plan from profiles (defaults to free). */
export async function getUserPlan(userId: string): Promise<PlanId> {
  try {
    const supabase = await createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("profiles").select("plan").eq("id", userId).single();
    return (data?.plan as PlanId) ?? "free";
  } catch {
    return "free";
  }
}

export interface GateOk { ok: true; plan: PlanId }
export interface GateErr { ok: false; status: 402; error: string; requiredPlan: PlanId }

/**
 * Server-side enforcement: resolve the user's plan and check a feature.
 * Returns a discriminated result; callers turn `!ok` into a 402 NextResponse.
 */
export async function requireFeature(userId: string, feature: GatedFeature): Promise<GateOk | GateErr> {
  const plan = await getUserPlan(userId);
  if (planAllows(plan, feature)) return { ok: true, plan };
  return {
    ok: false,
    status: 402,
    error: `This feature requires the ${requiredPlanLabel(feature)} plan.`,
    requiredPlan: FEATURE_MIN_PLAN[feature],
  };
}
