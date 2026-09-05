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
import { canWriteProjectFiles,getProjectAccess } from "@/lib/project/access";
import { getSandboxProvider,isSandboxEnabled,type SandboxFile } from "@/lib/sandbox";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";
import { patchSandboxPreviewFiles } from "@/lib/preview/patch-sandbox-preview-files";
import { randomUUID } from "node:crypto";
import { mergePreviewSnapshot, previewDeleteCommand } from "@/lib/preview/sync-project-snapshot";
import { attachPreviewRevision } from "@/lib/preview/preview-revision";
import { createKeyedSerialQueue } from "@/lib/editor/keyed-serial-queue";

const serializeSync = createKeyedSerialQueue();
const snapshotCache = new Map<string, { revision: string; files: SandboxFile[]; at: number }>();


async function handlePATCH(req: Request, params: { id: string }) {
  const { id: projectId } = params;

  if (!isSandboxEnabled()) {
    return Response.json({ enabled: false });
  }

  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  // Syncing writes attacker-controlled file content (including package.json,
  // which drives an in-container `npm install`) into the running sandbox —
  // requires write access, not just read.
  if (!canWriteProjectFiles(access)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const rl = await rateLimitAsync(`sandbox-sync:${user.id}`, RATE_LIMITS.api);
  if (!rl.success) {
    return Response.json({ error: "Rate limited" }, { status: 429 });
  }

  let sandboxId = "";
  let clientFiles: SandboxFile[] | undefined;
  let complete = false;
  let deletedPaths: string[] = [];
  let baseRevision: string | undefined;
  try {
    const body = (await req.json()) as {
      sandboxId?: string;
      files?: Array<{ path?: string; content?: string }>;
      complete?: boolean;
      deletedPaths?: string[];
      baseRevision?: string;
    };
    sandboxId = body.sandboxId ?? "";
    complete = body.complete === true;
    baseRevision = body.baseRevision;
    if (body.deletedPaths !== undefined && (!Array.isArray(body.deletedPaths) || body.deletedPaths.some((p) => typeof p !== "string"))) {
      return Response.json({ error: "Invalid deleted paths" }, { status: 400 });
    }
    deletedPaths = body.deletedPaths ?? [];
    if (Array.isArray(body.files)) {
      if (body.files.some((f) => !f || typeof f.path !== "string" || typeof f.content !== "string")) {
        return Response.json({ error: "Invalid file content" }, { status: 400 });
      }
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

  const cached = snapshotCache.get(sandboxId);
  let storedFiles: SandboxFile[] = [];
  if (!complete && baseRevision) {
    if (!cached || cached.revision !== baseRevision || Date.now() - cached.at > 300_000) {
      return Response.json({ ok: false, fullSyncRequired: true }, { status: 409 });
    }
    storedFiles = cached.files;
  } else if (!complete) {
    const { data: rows, error: filesError } = await supabase.from("project_files").select("path, content").eq("project_id", projectId);
    if (filesError) return Response.json({ error: filesError.message }, { status: 500 });
    storedFiles = (rows ?? []).map((r) => ({ path: r.path, content: r.content ?? "" }));
  }
  let syncSourceFiles: SandboxFile[];
  try {
    syncSourceFiles = mergePreviewSnapshot(storedFiles, clientFiles ?? [], complete, deletedPaths);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid files" }, { status: 400 });
  }

  if (!syncSourceFiles?.length) {
    return Response.json({ ok: false, error: "No files to sync" });
  }

  const { data: projectRow } = await supabase
    .from("projects")
    .select("is_public, metadata, environment")
    .eq("id", projectId)
    .maybeSingle();
  const metadata = projectRow?.metadata as Record<string, unknown> | null;
  if (!projectRow || metadata?.sandbox_id !== sandboxId) {
    return Response.json({ ok: false, error: "Invalid sandbox for this project" }, { status: 409 });
  }
  if (projectRow.environment === "live") {
    return Response.json({ ok: false, environment_locked: true, error: "Live environment is locked" }, { status: 423 });
  }

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
  // Keep the acknowledged source snapshot separate from sandbox-only repairs.
  let files: SandboxFile[] = syncSourceFiles.map((file) => ({ ...file }));
  let reconciledPackageJson: string | null = null;
  let reconciledPackages: string[] = [];
  let rejectedPackages: string[] = [];
  try {
    const allFiles = syncSourceFiles;
    const pkgRow = allFiles.find((f) => f.path.replace(/\\/g, "/") === "package.json");
    if (pkgRow?.content) {
      const { syncPackageJsonDeps } = await import("@/lib/ai/npm-auto-install");
      const sync = syncPackageJsonDeps(allFiles, pkgRow.content);
      if (sync && sync.rejectedPackages.length > 0) {
        // Refused imports are not written to package.json, so npm install cannot
        // 404 on them — but the sandbox will fail to resolve them at build time.
        // Report so the caller can show why, instead of a bare module error.
        rejectedPackages = sync.rejectedPackages;
      }
      if (sync && sync.addedPackages.length > 0) {
        reconciledPackageJson = sync.updated;
        reconciledPackages = sync.addedPackages;
        // Preview snapshots include unsaved edits and historical versions.
        // Repair only the sandbox copy: persisting this manifest here could
        // overwrite the current saved project with an older preview version.
        // Each full sync reconciles again; source persistence belongs to saves.
        // Ensure the corrected package.json is part of THIS sync.
        const idx = files.findIndex((f) => f.path.replace(/\\/g, "/") === "package.json");
        if (idx >= 0) files[idx] = { path: files[idx].path, content: sync.updated };
        else files = [...files, { path: "package.json", content: sync.updated }];
      }
    }
  } catch {
    /* non-fatal — fall through with original files */
  }

  const revision = randomUUID();
  const instrumented = attachPreviewRevision(patchSandboxPreviewFiles(files, patchOpts), revision);
  const syncFiles: SandboxFile[] = instrumented.files;
  const provider = getSandboxProvider();
  try {
    const incomingPkg =
      syncFiles.find((f) => f.path.replace(/\\/g, "/") === "package.json")?.content ?? "";
    let previousPkg = "";
    try {
      const existing = await provider.exec(sandboxId, "cat package.json 2>/dev/null || true");
      previousPkg = typeof existing.stdout === "string" ? existing.stdout : "";
    } catch {
      /* no existing manifest — treat as a real install if package.json lands */
    }

    if (deletedPaths.length) {
      const deletion = await provider.exec(sandboxId, previewDeleteCommand(deletedPaths));
      if (deletion.exitCode !== undefined && deletion.exitCode !== 0) throw new Error(deletion.stderr || "Could not remove stale preview files");
    }
    const writeResult = await provider.writeFiles(sandboxId, syncFiles, { prune: true });

    const norm = (p: string) => p.replace(/\\/g, "/");
    // Gate restarts on what ACTUALLY CHANGED ON DISK — nothing weaker works:
    //   • Keying off `syncFiles` (v1) restarted on every sync — the patcher
    //     always includes vite.config.ts + package.json.
    //   • Keying off client-sent files (v2) STILL restarted on every editor
    //     open, because the editor's baseline sync sends the FULL file set as
    //     `files` (verified live: open #2 after the incremental-upload fix
    //     still hit `pkill vite` and painted Bad Gateway).
    // The Docker provider's writeFiles now diffs against its in-container
    // content-hash manifest and reports exactly which paths landed. An open
    // with no edits writes [] → no install, no restart, clean first paint.
    // Providers that return void (Modal) fall back to the client-sent set.
    const written: string[] | null = Array.isArray(writeResult?.written)
      ? writeResult.written.map(norm)
      : null;
    const changed = written ?? (clientFiles ?? []).map((f) => norm(f.path));
    const diskChangedPkg = changed.includes("package.json");
    const diskChangedConfig = changed.some((p) =>
      /(^|\/)(vite|tailwind|postcss)\.config\.(ts|js|cjs|mjs)$/.test(p),
    );
    // Formatting-only package.json rewrites (JSON.stringify from the patcher)
    // used to look like a real dep change: every project switch ran npm install
    // and painted "Installing dependencies…" over an already-running preview.
    const { dependenciesAlreadySatisfied } = await import("@/lib/sandbox/deps-satisfied");
    const depsUnchanged = dependenciesAlreadySatisfied(previousPkg, incomingPkg, true).satisfied;
    const needInstall =
      reconciledPackageJson != null || (diskChangedPkg && !depsUnchanged);
    const buildConfigChanged = diskChangedConfig;
    if (needInstall || buildConfigChanged) {
      const steps: string[] = [];
      if (needInstall) steps.push("npm install");
      if (buildConfigChanged) {
        // App dir differs by provider: Docker = /home/node/app, Modal =
        // /workspace. Hardcoding /workspace made this `cd` fail on Docker, so the
        // dev server was killed but never restarted here — it came back only via
        // the supervisor loop, leaving a longer blank window. Pick the dir that
        // actually holds package.json so the restart works on both.
        steps.push(
          '(pkill -f vite || true); sleep 1; d=/home/node/app; [ -f "$d/package.json" ] || d=/workspace; cd "$d" && nohup npm run dev -- --host 0.0.0.0 --port 5173 >> /tmp/lifemark-dev.log 2>&1 &',
        );
      }
      void provider.exec(sandboxId, steps.join(" && ")).catch(() => {});
    }

    snapshotCache.delete(sandboxId);
    snapshotCache.set(sandboxId, { revision, files, at: Date.now() });
    while (snapshotCache.size > 100) snapshotCache.delete(snapshotCache.keys().next().value!);
    return Response.json({
      enabled: true,
      ok: true,
      fileCount: syncFiles.length,
      installing: needInstall,
      revision,
      requiresReload: instrumented.requiresReload,
      ...(reconciledPackages.length > 0 ? { addedDependencies: reconciledPackages } : {}),
      ...(rejectedPackages.length > 0 ? { rejectedDependencies: rejectedPackages } : {}),
    });
  } catch (e) {
    snapshotCache.delete(sandboxId);
    const msg = e instanceof Error ? e.message : "Sync failed";
    return Response.json({ enabled: true, ok: false, error: msg });
  }
}


export const Route = createFileRoute("/api/projects/$id/sandbox-preview/sync")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => serializeSync(params.id, () => handlePATCH(request, params)),
    },
  },
});
