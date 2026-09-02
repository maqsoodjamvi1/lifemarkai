import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles,canWriteProjectFiles,getProjectAccess } from "@/lib/project/access";
import { resolveLinkedSupabaseManagement } from "@/lib/cloud/project-backend";
import {
deployManagedEdgeFunction,
isManagementTokenConfigured,
listManagedEdgeFunctions,
} from "@/lib/cloud/management";
import { deployUserEdgeFunction,listUserEdgeFunctions } from "@/lib/cloud/user-supabase";

/**
 * Native /api/projects/:id/edge-functions — list (GET) / save+deploy (POST)
 * Supabase edge functions (managed Cloud when configured, else staged files).
 */
async function loadProjectCloud(supabase: any, projectId: string) {
  const { data } = await supabase
    .from("projects")
    .select("id, user_id, environment, cloud_enabled, cloud_project_ref")
    .eq("id", projectId)
    .maybeSingle();
  return data;
}

async function listLocalFunctions(supabase: any, projectId: string) {
  const { data: files } = await supabase
    .from("project_files")
    .select("path, updated_at")
    .eq("project_id", projectId)
    .like("path", "supabase/functions/%/index.ts");
  return (files ?? []).map((file: { path: string; updated_at: string }) => {
    const slug = file.path.split("/")[2] ?? "unknown";
    return { id: slug, name: slug, slug, status: "INACTIVE" as const, created_at: file.updated_at, updated_at: file.updated_at };
  });
}

export const Route = createFileRoute("/api/projects/$id/edge-functions")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canReadProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        const project = await loadProjectCloud(supabase, projectId);
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        if (project.cloud_project_ref && isManagementTokenConfigured()) {
          const result = await listManagedEdgeFunctions(project.cloud_project_ref);
          if (result.ok) return Response.json({ functions: result.functions, managed: true });
          return Response.json({ error: result.error ?? "Could not list managed functions" }, { status: 502 });
        }

        const linked = await resolveLinkedSupabaseManagement(supabase, user.id, project);
        if (linked) {
          const result = await listUserEdgeFunctions(linked.accessToken, linked.ref);
          if (result.ok) return Response.json({ functions: result.functions, managed: true, backend: "supabase" });
          return Response.json({ error: result.error ?? "Could not list functions on your Supabase project" }, { status: 502 });
        }

        return Response.json({
          functions: await listLocalFunctions(supabase, projectId),
          managed: false,
          message: "Source is saved in the project. Enable Lifemark Cloud or connect your Supabase account (Cloud → Connect existing) to deploy.",
        });
      },

      POST: async ({ request, params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        const body = (await request.json().catch(() => null)) as { name?: string; code?: string; verifyJwt?: boolean } | null;
        const slug = body?.name?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
        const code = body?.code?.trim();
        if (!slug || !code || slug.length > 63 || code.length > 1_000_000) {
          return Response.json({ error: "Provide a valid function name and up to 1 MB of TypeScript source." }, { status: 400 });
        }

        const project = await loadProjectCloud(supabase, projectId);
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        const path = `supabase/functions/${slug}/index.ts`;
        const { error: saveError } = await supabase.from("project_files").upsert({
          project_id: projectId,
          path,
          content: code,
          language: "typescript",
          updated_at: new Date().toISOString(),
        }, { onConflict: "project_id,path" });
        if (saveError) return Response.json({ error: saveError.message }, { status: 500 });

        if (project.cloud_project_ref && isManagementTokenConfigured()) {
          const deployment = await deployManagedEdgeFunction(project.cloud_project_ref, {
            slug,
            name: body?.name?.trim() || slug,
            code,
            verifyJwt: body?.verifyJwt,
          });
          if (!deployment.ok) {
            return Response.json({ error: deployment.error ?? "Supabase rejected the function deployment", sourceSaved: true }, { status: 502 });
          }
          return Response.json({ ok: true, deployed: true, function: deployment.function });
        }

        const linked = await resolveLinkedSupabaseManagement(supabase, user.id, project);
        if (linked) {
          const deployment = await deployUserEdgeFunction(linked.accessToken, linked.ref, {
            slug,
            name: body?.name?.trim() || slug,
            code,
            verifyJwt: body?.verifyJwt,
          });
          if (!deployment.ok) {
            return Response.json({ error: deployment.error ?? "Supabase rejected the function deployment", sourceSaved: true }, { status: 502 });
          }
          return Response.json({ ok: true, deployed: true, function: deployment.function, backend: "supabase" });
        }

        return Response.json({
          ok: true,
          deployed: false,
          slug,
          message: "Function source saved. Enable Lifemark Cloud or connect your Supabase account to deploy it.",
        });
      },
    },
  },
});
