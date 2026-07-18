// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPurchaseEnabled, type RegistrantContact } from "@/lib/domains/registrar";
import { completeDomainPurchase } from "@/lib/domains/complete-domain-purchase";
import { requireFeature } from "@/lib/plans/gating";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/domains/purchase — direct register (dev / registrar-only billing). */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(user.id, "workspace_domains");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, requiredPlan: gate.requiredPlan }, { status: gate.status });
  }

  if (!isPurchaseEnabled()) {
    return NextResponse.json({ error: "Domain purchase is not configured on this server." }, { status: 501 });
  }

  const { projectId, domain, contact, years = 1, autoRenew = true } = (await req.json().catch(() => ({}))) as {
    projectId?: string; domain?: string; contact?: RegistrantContact; years?: number; autoRenew?: boolean;
  };
  if (!projectId || !domain || !contact) {
    return NextResponse.json({ error: "projectId, domain and contact are required" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects").select("id").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const result = await completeDomainPurchase({
    projectId,
    userId: user.id,
    domain: domain.toLowerCase(),
    contact,
    years,
    autoRenew,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json(result);
}
