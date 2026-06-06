// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cloud/status?projectId=...
 *
 * Returns the Cloud config for a project plus available instance tiers.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const { data: project } = await supabase
    .from("projects")
    .select("id, cloud_enabled, cloud_region, cloud_instance, cloud_status, cloud_provisioned_at")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: tiers } = await supabase
    .from("lifemark_cloud_instances")
    .select("tier, display_name, monthly_cents, ram_mb, cpu_units, description")
    .order("monthly_cents", { ascending: true });

  const { data: backups } = await supabase
    .from("lifemark_cloud_auto_backups")
    .select("id, snapshot_id, run_date, status, notes")
    .eq("project_id", projectId)
    .order("run_date", { ascending: false })
    .limit(14);

  return NextResponse.json({
    project,
    tiers: tiers ?? [],
    backups: backups ?? [],
  });
}
