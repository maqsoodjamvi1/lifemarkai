import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/account/export — export all user data as JSON
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Gather all user data in parallel
  const [profileRes, projectsRes, messagesRes, deploymentsRes] = await Promise.all([
    (supabase as any).from("profiles").select("*").eq("id", user.id).single(),
    (supabase as any).from("projects").select("id, name, framework, status, created_at, updated_at").eq("user_id", user.id),
    (supabase as any).from("messages").select("id, project_id, role, content, created_at").eq("project_id.in", "(select id from projects where user_id = '" + user.id + "')"),
    (supabase as any).from("deployments").select("id, project_id, status, deploy_url, created_at").eq("project_id.in", "(select id from projects where user_id = '" + user.id + "')"),
  ]);

  // For messages we need a join-aware query
  const { data: messages } = await (supabase as any)
    .from("messages")
    .select("id, project_id, role, content, created_at, projects!inner(user_id)")
    .eq("projects.user_id", user.id);

  const exportData = {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    },
    profile: profileRes.data
      ? {
          full_name: profileRes.data.full_name,
          username: profileRes.data.username,
          bio: profileRes.data.bio,
          plan: profileRes.data.plan,
          credits: profileRes.data.credits,
          created_at: profileRes.data.created_at,
        }
      : null,
    projects: (projectsRes.data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id, name: p.name, framework: p.framework,
      status: p.status, created_at: p.created_at,
    })),
    messages: (messages ?? []).map((m: Record<string, unknown>) => ({
      id: m.id, project_id: m.project_id,
      role: m.role, content: m.content, created_at: m.created_at,
    })),
    deployments: (deploymentsRes.data ?? []).map((d: Record<string, unknown>) => ({
      id: d.id, project_id: d.project_id,
      status: d.status, deploy_url: d.deploy_url, created_at: d.created_at,
    })),
  };

  const json = JSON.stringify(exportData, null, 2);
  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="lifemarkai-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
