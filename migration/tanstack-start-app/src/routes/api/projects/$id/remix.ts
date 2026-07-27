// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/projects/:id/remix — fork a public, remix-enabled project. */
function hasSupabaseWired(files: Array<{ path: string; content: string }>): { hasSupabase: boolean; evidence: string[] } {
  const evidence: string[] = [];
  for (const f of files) {
    const lower = f.path.toLowerCase();
    if (/supabase\/(migrations|functions)\//.test(lower)) { evidence.push(f.path); continue; }
    const c = f.content ?? "";
    if (/@supabase\/(supabase-js|ssr|auth-helpers)/.test(c)) {
      evidence.push(`${f.path} (import)`);
    } else if (/NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(c)) {
      evidence.push(`${f.path} (env)`);
    } else if (/createClient\s*\(.*supabase/i.test(c)) {
      evidence.push(`${f.path} (client)`);
    }
    if (evidence.length >= 6) break;
  }
  const uniq = [...new Set(evidence)];
  return { hasSupabase: uniq.length > 0, evidence: uniq };
}

export const Route = createFileRoute("/api/projects/$id/remix")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        let body: { dryRun?: boolean; disconnectSupabase?: boolean } = {};
        try { body = await request.json(); } catch { /* empty body ok */ }

        const { data: source, error: srcErr } = await (supabase as any)
          .from("projects")
          .select("*, project_files(*)")
          .eq("id", id)
          .eq("is_public", true)
          .eq("remix_enabled", true)
          .single();

        if (srcErr || !source) {
          return Response.json({ error: "Project not found or remixing disabled" }, { status: 404 });
        }

        const sourceFiles = (source.project_files ?? []) as Array<{ path: string; content: string; language: string }>;
        const supabaseCheck = hasSupabaseWired(sourceFiles);

        if (body.dryRun) {
          return Response.json({
            ok: true,
            dryRun: true,
            hasSupabase: supabaseCheck.hasSupabase,
            supabaseEvidence: supabaseCheck.evidence,
            sourceName: source.name,
            fileCount: sourceFiles.length,
          });
        }

        const { data: newProject, error: createErr } = await (supabase as any)
          .from("projects")
          .insert({
            user_id: user.id,
            name: `${source.name} (Remix)`,
            description: source.description,
            framework: source.framework,
            status: "active",
            is_public: false,
            remix_of: source.id,
            remix_enabled: false,
            remix_count: 0,
            badge_hidden: false,
            knowledge: source.knowledge,
          })
          .select()
          .single();

        if (createErr || !newProject) {
          return Response.json({ error: createErr?.message ?? "Failed to create project" }, { status: 500 });
        }

        let files = sourceFiles;

        if (body.disconnectSupabase && supabaseCheck.hasSupabase) {
          files = files
            .filter((f) => !/supabase\/(migrations|functions)\//.test(f.path.toLowerCase()))
            .map((f) => ({
              ...f,
              content: (f.content ?? "")
                .replace(/^.*@supabase\/(supabase-js|ssr|auth-helpers).*$/gm,
                  "// TODO: re-wire data layer (Supabase imports removed during remix)")
                .replace(/process\.env\.NEXT_PUBLIC_SUPABASE_URL/g, '/* TODO: SUPABASE_URL */""')
                .replace(/process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/g, '/* TODO: SUPABASE_ANON_KEY */""'),
            }));
        }

        if (files.length > 0) {
          const { error: filesErr } = await (supabase as any).from("project_files").insert(
            files.map((f) => ({
              project_id: newProject.id,
              path: f.path,
              content: f.content,
              language: f.language,
            })),
          );
          if (filesErr) console.error("Failed to copy files:", filesErr.message);
        }

        (supabase as any).rpc("increment_remix_count", { project_id: source.id }).then(() => {});

        return Response.json({
          id: newProject.id,
          disconnectedSupabase: !!body.disconnectSupabase && supabaseCheck.hasSupabase,
        });
      },
    },
  },
});
