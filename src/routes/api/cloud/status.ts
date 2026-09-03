import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient,createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canWriteProjectFiles,denyUnlessProjectAccess } from "@/lib/project/access";
import {
getManagedProjectStatus,
getManagedProjectKeys,
isManagementConfigured,
configureManagedAuthRedirects,
} from "@/lib/cloud/management";
import { ENV_FILE_PATH,parseEnvFile,serializeEnvFile } from "@/lib/project/env-file";

const CLOUD_STATUS_PROJECT_COLUMNS = [
  "id", "cloud_enabled", "cloud_region", "cloud_instance", "cloud_status",
  "cloud_provisioned_at", "cloud_project_ref", "cloud_supabase_url", "deployed_url",
].join(", ");

interface CloudStatusProject {
  id: string;
  cloud_enabled: boolean;
  cloud_region: string | null;
  cloud_instance: string | null;
  cloud_status: string | null;
  cloud_provisioned_at: string | null;
  cloud_project_ref: string | null;
  cloud_supabase_url: string | null;
  deployed_url: string | null;
}

/** Native /api/cloud/status — Cloud config + tiers; finalizes managed provisioning when healthy. */
export const Route = createFileRoute("/api/cloud/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const projectId = new URL(request.url).searchParams.get("projectId");
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

        const gate = await denyUnlessProjectAccess(supabase, projectId, user.id, "read");
        if ("error" in gate) return gate.error;

        const { data: loadedProject } = await supabase.from("projects")
          .select(CLOUD_STATUS_PROJECT_COLUMNS).eq("id", projectId).single();
        let project = loadedProject as CloudStatusProject | null;
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        if (
          project.cloud_status === "provisioning" &&
          project.cloud_project_ref &&
          isManagementConfigured() &&
          canWriteProjectFiles(gate.access)
        ) {
          const projectRef = project.cloud_project_ref;
          try {
            const { status } = await getManagedProjectStatus(projectRef);
            if (status === "active") {
              const keys = await getManagedProjectKeys(projectRef);
              const admin = createAdminClient();
              const { error: credentialError } = await admin.from("project_cloud_credentials").upsert(
                { project_id: projectId, service_key: keys.serviceKey, updated_at: new Date().toISOString() },
                { onConflict: "project_id" },
              );
              if (credentialError) throw new Error(credentialError.message);

              const { data: updated } = await supabase.from("projects")
                .update({ cloud_status: "active", cloud_anon_key: keys.anonKey })
                .eq("id", projectId).select(CLOUD_STATUS_PROJECT_COLUMNS).single();
              if (updated) project = updated as unknown as CloudStatusProject;

              if (keys.anonKey && project.cloud_supabase_url) {
                try {
                  const { data: envRow } = await supabase.from("project_files")
                    .select("id, content").eq("project_id", projectId).eq("path", ENV_FILE_PATH).maybeSingle();
                  const env = parseEnvFile(envRow?.content ?? "");
                  if (env.VITE_SUPABASE_URL !== project.cloud_supabase_url || env.VITE_SUPABASE_ANON_KEY !== keys.anonKey) {
                    env.VITE_SUPABASE_URL = project.cloud_supabase_url;
                    env.VITE_SUPABASE_ANON_KEY = keys.anonKey;
                    await supabase.from("project_files").upsert(
                      { project_id: projectId, path: ENV_FILE_PATH, content: serializeEnvFile(env), language: "plaintext" },
                      { onConflict: "project_id,path" },
                    );
                  }
                } catch { /* best-effort */ }

                try {
                  const siteUrl = (project as { deployed_url?: string | null }).deployed_url ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
                  await configureManagedAuthRedirects(projectRef, siteUrl, ["http://localhost:3000", "http://localhost:5173"]);
                } catch { /* best-effort */ }
              }
            } else if (status === "failed") {
              await supabase.from("projects").update({ cloud_status: "failed" }).eq("id", projectId);
              project = { ...project, cloud_status: "failed" };
            }
          } catch { /* polling best-effort */ }
        }

        const { data: tiers } = await supabase.from("lifemark_cloud_instances")
          .select("tier, display_name, monthly_cents, ram_mb, cpu_units, description")
          .order("monthly_cents", { ascending: true });
        const admin = createAdminClient();
        const { data: backups } = await admin.from("lifemark_cloud_auto_backups")
          .select("id, snapshot_id, run_date, status, notes")
          .eq("project_id", projectId).order("run_date", { ascending: false }).limit(14);

        return Response.json({ project, tiers: tiers ?? [], backups: backups ?? [], managed: isManagementConfigured() });
      },
    },
  },
});
