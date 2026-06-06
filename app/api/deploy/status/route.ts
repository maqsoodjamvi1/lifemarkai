import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // Verify ownership
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, deployed_url, status")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch latest deployment record
  const { data: deployment } = await (supabase as any)
    .from("deployments")
    .select("id, status, url, created_at, error_message")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // If we have a Netlify deploy ID, poll their API for live status
  if (deployment?.id && process.env.NETLIFY_AUTH_TOKEN) {
    try {
      const resp = await fetch(`https://api.netlify.com/api/v1/deploys/${deployment.id}`, {
        headers: { Authorization: `Bearer ${process.env.NETLIFY_AUTH_TOKEN}` },
      });
      if (resp.ok) {
        const netlify = await resp.json() as { state: string; ssl_url?: string; url?: string; error_message?: string };
        const dbStatus =
          netlify.state === "ready" ? "live"
          : netlify.state === "error" ? "failed"
          : "building";

        // Sync back to DB if status changed
        if (dbStatus !== deployment.status) {
          await (supabase as any)
            .from("deployments")
            .update({ status: dbStatus, url: netlify.ssl_url ?? netlify.url })
            .eq("id", deployment.id);

          if (dbStatus === "live") {
            await (supabase as any)
              .from("projects")
              .update({ deployed_url: netlify.ssl_url ?? netlify.url, status: "active" })
              .eq("id", projectId);
          }
        }

        return NextResponse.json({
          status: dbStatus,
          url: netlify.ssl_url ?? netlify.url ?? deployment.url,
          deployedAt: deployment.created_at,
          error: netlify.error_message ?? null,
        });
      }
    } catch {
      // Fall through to DB status
    }
  }

  const url = deployment?.url ?? project.deployed_url ?? null;
  let status = deployment?.status ?? project.status ?? "idle";
  // Normalize: projects.status is "active" when live; deployments use "live"
  if (url && (status === "live" || status === "active" || status === "deployed")) {
    status = "live";
  }

  return NextResponse.json({
    status,
    url,
    deployedAt: deployment?.created_at ?? null,
    error: deployment?.error_message ?? null,
  });
}
