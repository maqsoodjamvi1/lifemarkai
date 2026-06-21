// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  isManagementConfigured,
  createManagedProject,
  managedProjectUrl,
  setManagedComputeTier,
} from "@/lib/cloud/management";

const VALID_REGIONS = ["americas", "europe", "asia-pacific"] as const;
const VALID_INSTANCES = ["tiny", "mini", "small", "medium", "large"] as const;

/**
 * POST /api/cloud/provision
 * Body: { projectId: string, region?: string, instance?: string }
 *
 * Enables Lifemark Cloud for a project. Once enabled the region is locked.
 * Behaviour mirrors Lovable Cloud's "Enable Cloud" flow.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, region, instance } = await req.json() as {
    projectId: string;
    region?: string;
    instance?: string;
  };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // Ownership check
  const { data: project } = await supabase
    .from("projects")
    .select("id, cloud_enabled, cloud_region, cloud_status")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (project.cloud_enabled && project.cloud_status === "active") {
    return NextResponse.json({
      ok: true,
      message: "Cloud already provisioned",
      region: project.cloud_region,
    });
  }

  // Pull workspace default region if none provided
  const { data: profile } = await supabase
    .from("profiles")
    .select("cloud_default_region")
    .eq("id", user.id)
    .single();

  const chosenRegion = (region ?? profile?.cloud_default_region ?? "americas").toLowerCase();
  const chosenInstance = (instance ?? "tiny").toLowerCase();

  if (!VALID_REGIONS.includes(chosenRegion as any)) {
    return NextResponse.json({ error: `Invalid region: ${chosenRegion}` }, { status: 400 });
  }
  if (!VALID_INSTANCES.includes(chosenInstance as any)) {
    return NextResponse.json({ error: `Invalid instance: ${chosenInstance}` }, { status: 400 });
  }

  // Provision. Two modes:
  //  - Managed (SUPABASE_MANAGEMENT_TOKEN + SUPABASE_ORG_ID set): creates a
  //    real, dedicated Supabase project (Postgres + Auth + Storage + Edge
  //    Functions) in the chosen region via the Management API. The project
  //    boots asynchronously; /api/cloud/status polls until ACTIVE_HEALTHY
  //    and then stores the API keys (migration 064).
  //  - Local (no Management credentials): mark the project active and rely on
  //    the platform's existing Supabase integration as the backing store.
  if (isManagementConfigured()) {
    try {
      const { ref } = await createManagedProject({ projectId, region: chosenRegion });
      const { error } = await supabase
        .from("projects")
        .update({
          cloud_enabled: true,
          cloud_region: chosenRegion,
          cloud_instance: chosenInstance,
          cloud_status: "provisioning",
          cloud_project_ref: ref,
          cloud_supabase_url: managedProjectUrl(ref),
          cloud_provisioned_at: new Date().toISOString(),
        })
        .eq("id", projectId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        ok: true,
        region: chosenRegion,
        instance: chosenInstance,
        status: "provisioning",
        ref,
        message: `Dedicated backend booting in ${chosenRegion} — usually ready in 1–2 minutes.`,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Provisioning failed" },
        { status: 502 }
      );
    }
  }

  const { error } = await supabase
    .from("projects")
    .update({
      cloud_enabled: true,
      cloud_region: chosenRegion,
      cloud_instance: chosenInstance,
      cloud_status: "active",
      cloud_provisioned_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    region: chosenRegion,
    instance: chosenInstance,
    status: "active",
    message: `Lifemark Cloud provisioned in ${chosenRegion} on ${chosenInstance} tier.`,
  });
}

/**
 * PATCH /api/cloud/provision
 * Body: { projectId, instance? }
 *
 * Upgrade or downgrade the instance tier. Region is locked once provisioned.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, instance } = await req.json() as {
    projectId: string;
    instance: string;
  };
  if (!projectId || !instance) {
    return NextResponse.json({ error: "projectId and instance required" }, { status: 400 });
  }
  const tier = instance.toLowerCase();
  if (!VALID_INSTANCES.includes(tier as any)) {
    return NextResponse.json({ error: "Invalid instance tier" }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("projects")
    .update({ cloud_instance: tier })
    .eq("id", projectId)
    .eq("user_id", user.id)
    .select("cloud_project_ref")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Managed mode: apply a real Supabase compute add-on for the tier.
  // Best-effort — local tier persists even if the billing API rejects.
  let computeNote: string | undefined;
  if (updated?.cloud_project_ref && isManagementConfigured()) {
    const result = await setManagedComputeTier(updated.cloud_project_ref, tier);
    if (!result.ok) computeNote = `Tier saved, but compute add-on update failed: ${result.note}`;
  }

  return NextResponse.json({ ok: true, instance: tier, ...(computeNote ? { warning: computeNote } : {}) });
}
