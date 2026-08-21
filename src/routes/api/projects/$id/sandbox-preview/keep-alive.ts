/**
 * POST /api/projects/:id/sandbox-preview/keep-alive
 *
 * Resets the running Modal sandbox's idle timer so it does NOT expire while the
 * user is actively editing. The client heartbeats this while the editor tab is
 * visible. Cheap + fail-soft: returns { alive: false } when the sandbox is gone
 * so the client can trigger a reconnect instead of showing a dead tunnel.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles,getProjectAccess } from "@/lib/project/access";
import { getSandboxProvider,isSandboxEnabled } from "@/lib/sandbox";


async function handlePOST(req: Request, params: { id: string }) {
  const { id: projectId } = params;

  if (!isSandboxEnabled()) {
    return Response.json({ enabled: false, alive: false });
  }

  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canReadProjectFiles(access)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  let sandboxId = "";
  let previewUrl: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      sandboxId?: string;
      previewUrl?: string;
    };
    sandboxId = body.sandboxId ?? "";
    if (typeof body.previewUrl === "string" && body.previewUrl) previewUrl = body.previewUrl;
  } catch {
    /* empty body ok — fall back to stored id */
  }

  // Fall back to the project's persisted sandbox id + preview url. The preview
  // url lets keepAlive probe the actual tunnel (zombie detection), not just the
  // container's compute liveness.
  if (!sandboxId || !previewUrl) {
    const { data: project } = await supabase
      .from("projects")
      .select("metadata")
      .eq("id", projectId)
      .maybeSingle();
    const meta =
      project?.metadata && typeof project.metadata === "object"
        ? (project.metadata as Record<string, unknown>)
        : {};
    if (!sandboxId && typeof meta.sandbox_id === "string") sandboxId = meta.sandbox_id;
    if (!previewUrl && typeof meta.preview_url === "string") previewUrl = meta.preview_url;
  }

  if (!sandboxId) {
    return Response.json({ enabled: true, alive: false });
  }

  const provider = getSandboxProvider();
  if (typeof provider.keepAlive !== "function") {
    return Response.json({ enabled: true, alive: true, unsupported: true });
  }

  try {
    const res = await provider.keepAlive(sandboxId, previewUrl ? { previewUrl } : undefined);
    return Response.json({ enabled: true, ...res });
  } catch {
    return Response.json({ enabled: true, alive: false });
  }
}


export const Route = createFileRoute("/api/projects/$id/sandbox-preview/keep-alive")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handlePOST(request, params),
    },
  },
});
