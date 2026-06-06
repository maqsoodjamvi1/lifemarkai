// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

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

  // "Provision" — in the real version this would spin up a managed Postgres
  // pool/edge function namespace. For now we mark the project active and rely
  // on the existing Supabase integration as the backing store.
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

  const { error } = await supabase
    .from("projects")
    .update({ cloud_instance: tier })
    .eq("id", projectId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, instance: tier });
}
