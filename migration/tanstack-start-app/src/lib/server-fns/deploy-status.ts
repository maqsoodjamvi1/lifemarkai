/**
 * Native deploy status poll (DB + optional Netlify live check).
 * Plain helper — not createServerFn (see project-files.ts).
 */
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";

export async function getDeployStatus(input: { projectId: string }) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, deployed_url, status")
    .eq("id", input.projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) return { status: "not_found" as const };

  const { data: deployment } = await (supabase as any)
    .from("deployments")
    // `error_message` is not a column on deployments (it has build_log). Including
    // it errored the whole select, so `deployment` was null and deploy status
    // reported nothing - while `url` sitting right beside it was correct all along.
    .select("id, status, url, created_at, build_log")
    .eq("project_id", input.projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (deployment?.id && process.env.NETLIFY_AUTH_TOKEN) {
    try {
      const resp = await fetch(
        `https://api.netlify.com/api/v1/deploys/${deployment.id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.NETLIFY_AUTH_TOKEN}`,
          },
        },
      );
      if (resp.ok) {
        const netlify = (await resp.json()) as {
          state: string;
          ssl_url?: string;
          url?: string;
          error_message?: string;
        };
        const dbStatus =
          netlify.state === "ready"
            ? "live"
            : netlify.state === "error"
              ? "failed"
              : "building";

        if (dbStatus !== deployment.status) {
          await (supabase as any)
            .from("deployments")
            .update({
              status: dbStatus,
              url: netlify.ssl_url ?? netlify.url,
            })
            .eq("id", deployment.id);

          if (dbStatus === "live") {
            await (supabase as any)
              .from("projects")
              .update({
                deployed_url: netlify.ssl_url ?? netlify.url,
                status: "active",
              })
              .eq("id", input.projectId);
          }
        }

        return {
          status: "ok" as const,
          deployStatus: dbStatus,
          url: netlify.ssl_url ?? netlify.url ?? deployment.url,
          deployedAt: deployment.created_at,
          error: netlify.error_message ?? null,
        };
      }
    } catch {
      /* fall through to DB */
    }
  }

  const url = deployment?.url ?? project.deployed_url ?? null;
  let deployStatus = deployment?.status ?? project.status ?? "idle";
  if (
    url &&
    (deployStatus === "live" ||
      deployStatus === "active" ||
      deployStatus === "deployed")
  ) {
    deployStatus = "live";
  }

  return {
    status: "ok" as const,
    deployStatus,
    url,
    deployedAt: deployment?.created_at ?? null,
    error: deployment?.error_message ?? null,
  };
}
