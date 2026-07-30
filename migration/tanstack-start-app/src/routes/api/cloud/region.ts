// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * GET/PUT /api/cloud/region — the default hosting region for new Cloud projects.
 *
 * `profiles.cloud_default_region` has existed since migration 048 and is READ at
 * provision time (`routes/api/cloud/provision.ts`), but nothing ever wrote it. The
 * column worked, the plumbing worked, and the value could only be changed by
 * editing the database by hand — so in practice every project provisioned into the
 * fallback region regardless of what the user wanted.
 *
 * The region list is the set Supabase actually offers for project creation. An
 * unknown value is rejected rather than stored, because a bad region is not
 * discovered until provisioning fails, at which point the error is opaque.
 */

const REGIONS = [
  { id: "us-east-1", label: "US East (N. Virginia)", area: "Americas" },
  { id: "us-west-1", label: "US West (N. California)", area: "Americas" },
  { id: "ca-central-1", label: "Canada (Central)", area: "Americas" },
  { id: "sa-east-1", label: "South America (São Paulo)", area: "Americas" },
  { id: "eu-west-1", label: "EU West (Ireland)", area: "Europe" },
  { id: "eu-west-2", label: "EU West (London)", area: "Europe" },
  { id: "eu-central-1", label: "EU Central (Frankfurt)", area: "Europe" },
  { id: "eu-north-1", label: "EU North (Stockholm)", area: "Europe" },
  { id: "ap-southeast-1", label: "Asia Pacific (Singapore)", area: "Asia Pacific" },
  { id: "ap-northeast-1", label: "Asia Pacific (Tokyo)", area: "Asia Pacific" },
  { id: "ap-northeast-2", label: "Asia Pacific (Seoul)", area: "Asia Pacific" },
  { id: "ap-southeast-2", label: "Asia Pacific (Sydney)", area: "Asia Pacific" },
  { id: "ap-south-1", label: "Asia Pacific (Mumbai)", area: "Asia Pacific" },
] as const;

const VALID = new Set(REGIONS.map((r) => r.id));

export const Route = createFileRoute("/api/cloud/region")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: profile } = await supabase
          .from("profiles")
          .select("cloud_default_region")
          .eq("id", user.id)
          .maybeSingle();

        return Response.json({
          regions: REGIONS,
          current: profile?.cloud_default_region ?? null,
          // Said out loud so the UI can explain the blank state honestly rather
          // than showing a default that was never chosen.
          note: profile?.cloud_default_region
            ? "New Cloud projects will be created in this region."
            : "No region chosen — new Cloud projects use the server's fallback region.",
        });
      },

      PUT: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { region } = await request.json().catch(() => ({}));
        if (typeof region !== "string" || !VALID.has(region)) {
          return Response.json(
            { error: "Unknown region.", validRegions: REGIONS.map((r) => r.id) },
            { status: 400 },
          );
        }

        const { error } = await supabase
          .from("profiles")
          .update({ cloud_default_region: region })
          .eq("id", user.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({
          ok: true,
          region,
          // Existing projects are not migrated. Saying so prevents the reasonable
          // assumption that changing this moves live databases.
          note: "Applies to Cloud projects created from now on. Existing projects stay where they are.",
        });
      },
    },
  },
});
