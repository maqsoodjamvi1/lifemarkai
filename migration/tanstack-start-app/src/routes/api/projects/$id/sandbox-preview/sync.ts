// @ts-nocheck
/**
 * PATCH /api/projects/:id/sandbox-preview/sync
 *
 * Incrementally writes updated project files into a running Modal sandbox so
 * preview stays live after AI edits (Lovable server-side model). No-ops when
 * sandbox backend isn't configured.
 *
 * Body: { sandboxId: string, files?: Array<{ path: string; content: string }> }
 * When `files` is omitted, all project_files rows are synced.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";
import { getSandboxProvider, isSandboxEnabled, type SandboxFile } from "@/lib/sandbox";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { patchSandboxPreviewFiles } from "@/lib/preview/patch-sandbox-preview-files";


interface Params {
  params: Promise<{ id: string }>;
}

async function handlePATCH(req: Request, params: any) {
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

  const rl = await rateLimitAsync(`sandbox-sync:${user.id}`, RATE_LIMITS.ai);
  if (!rl.success) {
    return Response.json({ error: "Rate limited" }, { status: 429 });
  }

  let sandboxId = "";
  let clientFiles: SandboxFile[] | undefined;
  try {
    const body = (await req.json()) as {
      sandboxId?: string;
      files?: Array<{ path?: string; content?: string }>;
    };
    sandboxId = body.sandboxId ?? "";
    if (Array.isArray(body.files)) {
      clientFiles = body.files
        .filter((f) => typeof f.path === "string")
        .map((f) => ({ path: f.path!, content: f.content ?? "" }));
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!sandboxId) {
    return Response.json({ error: "sandboxId required" }, { status: 400 });
  }

  let syncSourceFiles = clientFiles;
  if (!syncSourceFiles?.length) {
    const { data: rows, error } = await (supabase as any)
      .from("project_files")
      .select("path, content")
      .eq("project_id", projectId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    syncSourceFiles = (rows ?? [])
      .filter((r: { path?: string }) => typeof r.path === "string")
      .map((r: { path: string; content: string | null }) => ({
        path: r.path,
        content: r.content ?? "",
      }));
  }

  if (!syncSourceFiles?.length) {
    return Response.json({ ok: false, error: "No files to sync" });
  }

  const { data: projectRow } = await (supabase as any)
    .from("projects")
    .select("is_public")
    .eq("id", projectId)
    .maybeSingle();

  const patchOpts = {
    projectId,
    isPublic: !!projectRow?.is_public,
    appOrigin: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, ""),
  };

  // ── Server-side dependency reconciliation (production crash killer) ────────
  // The #1 cause of "Preview root is empty / app crashed on mount" is the AI
  // adding a component that imports a package (class-variance-authority,
  // @radix-ui/*, tailwind-merge, clsx, framer-motion, …) WITHOUT adding it to
  // package.json. Vite then throws "Failed to resolve import" and the app
  // never mounts. The client-side sync only fires when the AI returns
  // package.json, which it usually doesn't. Reconcile here against the FULL
  // project so a missing dep can never reach the sandbox unresolved.
  let files: SandboxFile[] = syncSourceFiles as SandboxFile[];
  let reconciledPackageJson: string | null = null;
  let reconciledPackages: string[] = [];
  try {
    const { data: allRows } = await (supabase as any)
      .from("project_files")
      .select("path, content")
      .eq("project_id", projectId);
    const allFiles: SandboxFile[] = (allRows ?? [])
      .filter((r: { path?: string }) => typeof r.path === "string")
      .map((r: { path: string; content: string | null }) => ({ path: r.path, content: r.content ?? "" }));
    const pkgRow = allFiles.find((f) => f.path.replace(/\\/g, "/") === "package.json");
    if (pkgRow?.content) {
      const { syncPackageJsonDeps } = await import("@/lib/ai/npm-auto-install");
      const sync = syncPackageJsonDeps(allFiles, pkgRow.content);
      if (sync && sync.addedPackages.length > 0) {
        reconciledPackageJson = sync.updated;
        reconciledPackages = sync.addedPackages;
        // Persist so the fix survives reloads + future syncs.
        await (supabase as any)
          .from("project_files")
          .update({ content: sync.updated, updated_at: new Date().toISOString() })
          .eq("project_id", projectId)
          .eq("path", "package.json");
        // Ensure the corrected package.json is part of THIS sync.
        const idx = files.findIndex((f) => f.path.replace(/\\/g, "/") === "package.json");
        if (idx >= 0) files[idx] = { path: files[idx].path, content: sync.updated };
        else files = [...files, { path: "package.json", content: sync.updated }];
      }
    }
  } catch {
    /* non-fatal — fall through with original files */
  }

  const syncFiles: SandboxFile[] = patchSandboxPreviewFiles(files, patchOpts);
  const provider = getSandboxProvider();
  try {
    await provider.writeFiles(sandboxId, syncFiles);

    const norm = (p: string) => p.replace(/\\/g, "/");
    const pkgChanged =
      reconciledPackageJson != null || syncFiles.some((f) => norm(f.path) === "package.json");
    // Vite reads vite/tailwind/postcss config ONLY at startup — syncing a new
    // config into a running sandbox silently does nothing (observed: Tailwind
    // classes stayed inert until a manual restart). Restart the dev server.
    // NOTE: do NOT restart for `.env` here. The preview patcher injects an
    // idempotent placeholder .env on EVERY sync, so keying a restart on ".env
    // present" caused a restart loop that raced the tunnel down. The .env is
    // consumed at cold-boot startup (where Vite reads it once); real creds are
    // rare and Vite's own watcher handles those.
    const buildConfigChanged = syncFiles.some((f) =>
      /(^|\/)(vite|tailwind|postcss)\.config\.(ts|js|cjs|mjs)$/.test(norm(f.path)),
    );
    if (pkgChanged || buildConfigChanged) {
      const steps: string[] = [];
      if (pkgChanged) steps.push("npm install");
      if (buildConfigChanged) {
        steps.push(
          "(pkill -f vite || true); sleep 1; cd /workspace && nohup npm run dev -- --host 0.0.0.0 --port 5173 >> /tmp/lifemark-dev.log 2>&1 &",
        );
      }
      void provider.exec(sandboxId, steps.join(" && ")).catch(() => {});
    }

    return Response.json({
      enabled: true,
      ok: true,
      fileCount: syncFiles.length,
      installing: pkgChanged || buildConfigChanged,
      ...(reconciledPackages.length > 0 ? { addedDependencies: reconciledPackages } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return Response.json({ enabled: true, ok: false, error: msg });
  }
}


export const Route = createFileRoute("/api/projects/$id/sandbox-preview/sync")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => handlePATCH(request, params),
    },
  },
});
