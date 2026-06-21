// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  getManagedProjectStatus,
  getManagedProjectKeys,
  isManagementConfigured,
  configureManagedAuthRedirects,
} from "@/lib/cloud/management";
import { ENV_FILE_PATH, parseEnvFile, serializeEnvFile } from "@/lib/project/env-file";

/**
 * GET /api/cloud/status?projectId=...
 *
 * Returns the Cloud config for a project plus available instance tiers.
 * When the project has a dedicated managed backend that is still booting
 * (cloud_status = 'provisioning'), polls the Supabase Management API and
 * finalizes provisioning (stores API keys) once the backend is healthy.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // select("*") keeps this working on databases that haven't run migration
  // 064 yet (cloud_project_ref / cloud_supabase_url columns).
  let { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Managed backend still booting → poll and finalize when healthy
  if (
    project.cloud_status === "provisioning" &&
    project.cloud_project_ref &&
    isManagementConfigured()
  ) {
    try {
      const { status } = await getManagedProjectStatus(project.cloud_project_ref);
      if (status === "active") {
        const keys = await getManagedProjectKeys(project.cloud_project_ref);
        const { data: updated } = await supabase
          .from("projects")
          .update({
            cloud_status: "active",
            cloud_anon_key: keys.anonKey,
            cloud_service_key: keys.serviceKey,
          })
          .eq("id", projectId)
          .select("id, cloud_enabled, cloud_region, cloud_instance, cloud_status, cloud_provisioned_at, cloud_project_ref, cloud_supabase_url, deployed_url")
          .single();
        if (updated) project = updated;

        // Backend just became healthy → finish auto-wiring (Lovable parity):
        //  1. Push VITE_SUPABASE_* credentials into the generated app's .env.local
        //  2. Configure auth redirect URLs so login works on the published app
        if (keys.anonKey && project.cloud_supabase_url) {
          try {
            const { data: envRow } = await supabase
              .from("project_files")
              .select("id, content")
              .eq("project_id", projectId)
              .eq("path", ENV_FILE_PATH)
              .maybeSingle();
            const env = parseEnvFile(envRow?.content ?? "");
            if (env.VITE_SUPABASE_URL !== project.cloud_supabase_url || env.VITE_SUPABASE_ANON_KEY !== keys.anonKey) {
              env.VITE_SUPABASE_URL = project.cloud_supabase_url;
              env.VITE_SUPABASE_ANON_KEY = keys.anonKey;
              await supabase.from("project_files").upsert(
                { project_id: projectId, path: ENV_FILE_PATH, content: serializeEnvFile(env), language: "plaintext" },
                { onConflict: "project_id,path" }
              );
            }
          } catch { /* best-effort */ }

          try {
            const siteUrl =
              (project as { deployed_url?: string | null }).deployed_url ??
              process.env.NEXT_PUBLIC_APP_URL ??
              "http://localhost:3000";
            await configureManagedAuthRedirects(project.cloud_project_ref, siteUrl, [
              "http://localhost:3000",
              "http://localhost:5173",
            ]);
          } catch { /* best-effort */ }
        }
      } else if (status === "failed") {
        await supabase.from("projects").update({ cloud_status: "failed" }).eq("id", projectId);
        project = { ...project, cloud_status: "failed" };
      }
    } catch {
      // Polling is best-effort; the next status call retries.
    }
  }

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
    managed: isManagementConfigured(),
  });
}
