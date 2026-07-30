// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { buildFallbackHtml } from "@/lib/preview/build-fallback-html";
import { verifyPreviewHtml } from "@/lib/ai/preview-verify";
import { runSelfVerification } from "@/lib/ai/self-verify";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";


/** POST — quick preview sanity check after AI builds (prefers live Modal URL). */
async function handlePOST(req: Request, params: any) {
  const { id } = params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canReadProjectFiles(access)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  let clientPreviewUrl: string | null = null;
  try {
    const body = (await req.json()) as { previewUrl?: unknown };
    if (typeof body?.previewUrl === "string" && /^https?:\/\//i.test(body.previewUrl.trim())) {
      clientPreviewUrl = body.previewUrl.trim();
    }
  } catch {
    /* empty body is fine */
  }

  const { data: projectRow } = await (supabase as any)
    .from("projects")
    .select("preview_url, deployed_url")
    .eq("id", id)
    .maybeSingle();

  const previewUrl =
    clientPreviewUrl ??
    (typeof projectRow?.preview_url === "string" && /^https?:\/\//i.test(projectRow.preview_url)
      ? projectRow.preview_url
      : typeof projectRow?.deployed_url === "string" && /^https?:\/\//i.test(projectRow.deployed_url)
        ? projectRow.deployed_url
        : null);

  const { data: files, error } = await (supabase as any)
    .from("project_files")
    .select("path, content, language, project_id, id, created_at, updated_at")
    .eq("project_id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!files?.length) {
    return Response.json({ ok: false, checks: [{ name: "Files", pass: false, detail: "No files" }] });
  }

  // Static srcdoc checks remain useful for cold-start / no-Modal projects.
  const html = buildFallbackHtml(files);
  const result = verifyPreviewHtml(html);

  const runtime = await runSelfVerification({
    supabase,
    projectId: id,
    userId: user.id,
    maxRounds: 0,
    previewUrl,
  });

  if (!runtime) return Response.json(result);

  const liveLabel = previewUrl ? "Live preview" : `Runtime render (${runtime.engine})`;
  return Response.json({
    ok: (previewUrl ? true : result.ok) && runtime.passed,
    previewUrl: previewUrl ?? null,
    checks: [
      ...(previewUrl
        ? [
            {
              name: "Live preview URL",
              pass: true,
              detail: previewUrl.replace(/^https?:\/\//, "").slice(0, 80),
            },
          ]
        : result.checks),
      {
        name: liveLabel,
        pass: runtime.passed,
        detail: runtime.passed
          ? previewUrl
            ? "Mounted without runtime errors on live preview"
            : "Mounted without runtime errors"
          : runtime.errors.slice(0, 2).join("; "),
      },
    ],
  });
}


export const Route = createFileRoute("/api/projects/$id/preview-verify")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handlePOST(request, params),
    },
  },
});
