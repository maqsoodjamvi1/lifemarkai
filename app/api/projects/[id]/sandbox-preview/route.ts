/**
 * POST /api/projects/:id/sandbox-preview
 *
 * Runs the project's files in a real isolated sandbox (E2B) and returns a LIVE
 * preview URL of the running app. When the sandbox backend isn't configured
 * (no E2B_API_KEY / SDK), responds with { enabled: false } so the client falls
 * back to the in-browser WebContainer / srcdoc preview.
 *
 * See lib/sandbox/index.ts and docs/titan/05-platform-business-layer.md §7.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";
import { getSandboxProvider, isSandboxEnabled, type SandboxFile } from "@/lib/sandbox";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;

  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Not configured → tell the client to use the in-browser preview engine.
  if (!isSandboxEnabled()) {
    return NextResponse.json({ enabled: false, reason: "sandbox_not_configured" });
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const rl = await rateLimitAsync(`sandbox-preview:${user.id}`, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const { data: rows, error } = await (supabase as any)
    .from("project_files")
    .select("path, content")
    .eq("project_id", projectId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) {
    return NextResponse.json({ enabled: true, ok: false, error: "Project has no files." });
  }

  const files: SandboxFile[] = rows
    .filter((r: { path?: string; content?: string }) => typeof r.path === "string")
    .map((r: { path: string; content: string | null }) => ({
      path: r.path,
      content: r.content ?? "",
    }));

  // Detect framework start command from the file set.
  const paths = files.map((f) => f.path.replace(/\\/g, "/"));
  const isNext = paths.some((p) => /next\.config\.(t|j|m)s$/.test(p));
  const port = 3000;
  const startCommand = isNext ? `npx next dev -p ${port}` : `npm run dev -- --port ${port} --host`;

  const provider = getSandboxProvider();
  const result = await provider.runProject({
    files,
    port,
    startCommand,
    template: process.env.E2B_TEMPLATE,
  });

  if (!result.ok) {
    return NextResponse.json({ enabled: true, ok: false, error: result.error, logs: result.logs });
  }

  // Persist the live preview URL for reconnects. Use the dedicated `preview_url`
  // column — NOT `deployed_url`, which holds the real production deploy URL and
  // must not be clobbered by an ephemeral sandbox link (it dies on teardown,
  // leaving "Visit site" pointing at a dead sandbox). The URL is also returned
  // below and kept in client state for the session.
  const { error: previewUrlErr } = await (supabase as any)
    .from("projects")
    .update({ preview_url: result.previewUrl })
    .eq("id", projectId);
  if (previewUrlErr) {
    console.warn("[sandbox-preview] failed to persist preview_url:", previewUrlErr.message);
  }

  return NextResponse.json({
    enabled: true,
    ok: true,
    previewUrl: result.previewUrl,
    sandboxId: result.sandboxId,
    logs: result.logs,
  });
}
