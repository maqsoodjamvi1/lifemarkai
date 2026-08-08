import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import {
isManagementConfigured,
createManagedProject,
managedProjectUrl,
setManagedComputeTier,
} from "@/lib/cloud/management";
import { persistManagedDbPassword } from "@/lib/cloud/credentials";

const VALID_REGIONS = ["americas", "europe", "asia-pacific"] as const;
const VALID_INSTANCES = ["tiny", "mini", "small", "medium", "large"] as const;

/** Native /api/cloud/provision — POST enable Cloud, PATCH change instance tier. */
export const Route = createFileRoute("/api/cloud/provision")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { projectId, region, instance } = (await request.json().catch(() => ({}))) as { projectId?: string; region?: string; instance?: string };
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

        const { data: project } = await supabase.from("projects")
          .select("id, cloud_enabled, cloud_region, cloud_status").eq("id", projectId).eq("user_id", user.id).single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        if (project.cloud_enabled && project.cloud_status === "active") {
          return Response.json({ ok: true, message: "Cloud already provisioned", region: project.cloud_region });
        }
        if (project.cloud_enabled && project.cloud_status === "provisioning") {
          return Response.json({ ok: true, message: "Cloud provisioning is already in progress", region: project.cloud_region, status: "provisioning" }, { status: 202 });
        }

        const { data: profile } = await supabase.from("profiles").select("cloud_default_region").eq("id", user.id).single();
        const chosenRegion = (region ?? profile?.cloud_default_region ?? "americas").toLowerCase();
        const chosenInstance = (instance ?? "tiny").toLowerCase();
        if (!VALID_REGIONS.includes(chosenRegion as any)) return Response.json({ error: `Invalid region: ${chosenRegion}` }, { status: 400 });
        if (!VALID_INSTANCES.includes(chosenInstance as any)) return Response.json({ error: `Invalid instance: ${chosenInstance}` }, { status: 400 });

        if (isManagementConfigured()) {
          try {
            const { ref, dbPassword } = await createManagedProject({ projectId, region: chosenRegion });
            // Save the one-time Postgres password before anything else can
            // fail. Supabase never shows it again — see cloud/credentials.ts.
            const savedPassword = await persistManagedDbPassword(projectId, dbPassword);
            const { error } = await supabase.from("projects").update({
              cloud_enabled: true, cloud_region: chosenRegion, cloud_instance: chosenInstance,
              cloud_status: "provisioning", cloud_project_ref: ref, cloud_supabase_url: managedProjectUrl(ref),
              cloud_provisioned_at: new Date().toISOString(),
            }).eq("id", projectId);
            if (error) return Response.json({ error: error.message }, { status: 500 });
            return Response.json({
              ok: true, region: chosenRegion, instance: chosenInstance, status: "provisioning", ref,
              message: `Dedicated backend booting in ${chosenRegion} — usually ready in 1–2 minutes.`,
              // Surfaced, not swallowed: a backend whose password we failed to
              // store still works over REST, so the user would never find out
              // on their own until the day they need a direct connection.
              ...(savedPassword.ok ? {} : { warning: `Database password could not be saved (${savedPassword.error}). Reset it in the Supabase dashboard if you need direct Postgres access.` }),
            });
          } catch (err) {
            return Response.json({ error: err instanceof Error ? err.message : "Provisioning failed" }, { status: 502 });
          }
        }

        const { error } = await supabase.from("projects").update({
          cloud_enabled: true, cloud_region: chosenRegion, cloud_instance: chosenInstance,
          cloud_status: "active", cloud_provisioned_at: new Date().toISOString(),
        }).eq("id", projectId);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, region: chosenRegion, instance: chosenInstance, status: "active", message: `Lifemark Cloud provisioned in ${chosenRegion} on ${chosenInstance} tier.` });
      },

      PATCH: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { projectId, instance } = (await request.json().catch(() => ({}))) as { projectId?: string; instance?: string };
        if (!projectId || !instance) return Response.json({ error: "projectId and instance required" }, { status: 400 });
        const tier = instance.toLowerCase();
        if (!VALID_INSTANCES.includes(tier as any)) return Response.json({ error: "Invalid instance tier" }, { status: 400 });

        const { data: updated, error } = await supabase.from("projects")
          .update({ cloud_instance: tier }).eq("id", projectId).eq("user_id", user.id).select("cloud_project_ref").single();
        if (error) return Response.json({ error: error.message }, { status: 500 });

        let computeNote: string | undefined;
        if (updated?.cloud_project_ref && isManagementConfigured()) {
          const result = await setManagedComputeTier(updated.cloud_project_ref, tier);
          if (!result.ok) computeNote = `Tier saved, but compute add-on update failed: ${result.note}`;
        }
        return Response.json({ ok: true, instance: tier, ...(computeNote ? { warning: computeNote } : {}) });
      },
    },
  },
});
