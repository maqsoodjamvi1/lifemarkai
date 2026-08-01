// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/account/export — export all of a user's data as a JSON download. */
export const Route = createFileRoute("/api/account/export")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const [profileRes, projectsRes, , deploymentsRes] = await Promise.all([
          (supabase as any).from("profiles").select("*").eq("id", user.id).single(),
          (supabase as any).from("projects").select("id, name, framework, status, created_at, updated_at").eq("user_id", user.id),
          Promise.resolve(null),
          (supabase as any)
            .from("deployments")
            // `url`, not `deploy_url` - the wrong name errored the select, so the
            // account export silently omitted every deployment. A GDPR export that
            // quietly drops a section is worse than one that fails loudly.
            .select("id, project_id, status, url, created_at, projects!inner(user_id)")
            .eq("projects.user_id", user.id),
        ]);

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
            id: p.id, name: p.name, framework: p.framework, status: p.status, created_at: p.created_at,
          })),
          messages: (messages ?? []).map((m: Record<string, unknown>) => ({
            id: m.id, project_id: m.project_id, role: m.role, content: m.content, created_at: m.created_at,
          })),
          deployments: (deploymentsRes.data ?? []).map((d: Record<string, unknown>) => ({
            id: d.id, project_id: d.project_id, status: d.status, url: d.url, created_at: d.created_at,
          })),
        };

        const json = JSON.stringify(exportData, null, 2);
        return new Response(json, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="lifemarkai-export-${new Date().toISOString().slice(0, 10)}.json"`,
          },
        });
      },
    },
  },
});
