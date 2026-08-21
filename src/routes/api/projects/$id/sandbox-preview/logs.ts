/**
 * GET /api/projects/:id/sandbox-preview/logs?sandboxId=
 * Tail Modal Vite/Next log for the preview Console tab (Lovable parity).
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles,getProjectAccess } from "@/lib/project/access";
import { getSandboxProvider,isSandboxEnabled } from "@/lib/sandbox";


async function handleGET(req: Request, params: { id: string }) {
  const { id: projectId } = params;

  if (!isSandboxEnabled()) {
    return Response.json({ enabled: false });
  }

  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canReadProjectFiles(access)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const queryId = new URL(req.url).searchParams.get("sandboxId");
  const { data: project } = await supabase
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .maybeSingle();
  const meta =
    project?.metadata && typeof project.metadata === "object"
      ? (project.metadata as Record<string, unknown>)
      : {};
  const sandboxId =
    queryId || (typeof meta.sandbox_id === "string" ? meta.sandbox_id : null);

  if (!sandboxId) {
    return Response.json({ enabled: true, ok: false, error: "no_sandbox_id" });
  }

  const provider = getSandboxProvider();
  if (!provider.getDevLogs) {
    return Response.json({
      enabled: true,
      ok: false,
      error: "Logs not supported for this sandbox provider",
      provider: provider.id,
    });
  }

  try {
    const lines = Number(new URL(req.url).searchParams.get("lines") ?? 80);
    const text = await provider.getDevLogs(sandboxId, lines);
    return Response.json({
      enabled: true,
      ok: true,
      sandboxId,
      provider: provider.id,
      logs: text,
    });
  } catch (err) {
    return Response.json({
      enabled: true,
      ok: false,
      error: err instanceof Error ? err.message : "Failed to read logs",
    });
  }
}


export const Route = createFileRoute("/api/projects/$id/sandbox-preview/logs")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleGET(request, params),
    },
  },
});
