/**
 * Native project snapshots — list / reconstruct / create / pin / delete / restore.
 */
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";
import {
  computePatches,
  reconstructFromChain,
  filesSize,
  patchesSize,
  shouldStoreBaseline,
  type SnapshotFile,
  type FilePatch,
  type SnapshotChainEntry,
} from "@/lib/diff/snapshot-diff";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getChainDepth(supabase: any, latestId: string): Promise<number> {
  const { data } = await supabase.rpc("count_delta_chain", {
    p_snapshot_id: latestId,
  });
  return (data as number) ?? 0;
}

function detectSchemaChanges(
  currentFiles: Array<{ path: string; content: string }>,
  targetFiles: Array<{ path: string; content: string }>,
): { schemaPaths: string[]; addedTables: string[]; removedTables: string[] } {
  const SCHEMA_PATH_RE =
    /(supabase\/migrations\/|migrations\/|prisma\/schema|drizzle\/|schema\.sql$|\.sql$|schema\.prisma$)/i;
  const currentMap = new Map(currentFiles.map((f) => [f.path, f.content]));
  const targetMap = new Map(targetFiles.map((f) => [f.path, f.content]));
  const allPaths = new Set([...currentMap.keys(), ...targetMap.keys()]);

  const schemaPaths: string[] = [];
  const addedTables: string[] = [];
  const removedTables: string[] = [];
  const TABLE_RE =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z0-9_]+)["`]?/gi;

  for (const path of allPaths) {
    if (!SCHEMA_PATH_RE.test(path)) continue;
    const cur = currentMap.get(path) ?? "";
    const tgt = targetMap.get(path) ?? "";
    if (cur === tgt) continue;
    schemaPaths.push(path);
    const curTables = new Set<string>();
    const tgtTables = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = TABLE_RE.exec(cur)) !== null) curTables.add(m[1].toLowerCase());
    TABLE_RE.lastIndex = 0;
    while ((m = TABLE_RE.exec(tgt)) !== null) tgtTables.add(m[1].toLowerCase());
    for (const t of curTables) if (!tgtTables.has(t)) removedTables.push(t);
    for (const t of tgtTables) if (!curTables.has(t)) addedTables.push(t);
  }
  return {
    schemaPaths,
    addedTables: [...new Set(addedTables)],
    removedTables: [...new Set(removedTables)],
  };
}

export async function listOrGetSnapshot(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    if (data.id) {
      const { data: snap } = await (supabase as any)
        .from("project_snapshots")
        .select("id, user_id, project_id")
        .eq("id", data.id)
        .single();
      if (!snap) return { status: "not_found" as const };

      const access = await getProjectAccess(supabase, snap.project_id, user.id);
      if (!canReadProjectFiles(access)) return { status: "not_found" as const };

      const { data: chain, error } = await (supabase as any).rpc(
        "get_snapshot_chain",
        { p_snapshot_id: data.id },
      );
      if (error) return { status: "error" as const, message: error.message };

      const files = reconstructFromChain((chain ?? []) as SnapshotChainEntry[]);
      return { status: "ok" as const, kind: "files" as const, files };
    }

    if (!data.projectId) {
      return {
        status: "bad_request" as const,
        error: "projectId or id required",
      };
    }

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canReadProjectFiles(access)) return { status: "not_found" as const };

    const { data: rows } = await (supabase as any)
      .from("project_snapshots")
      .select("id, label, is_baseline, is_pinned, pinned_at, created_at, screenshot_url")
      .eq("project_id", data.projectId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    return { status: "ok" as const, kind: "list" as const, snapshots: rows ?? [] };
}

export async function createSnapshot(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    const { data: project } = await (supabase as any)
      .from("projects")
      .select("id, user_id, preview_url")
      .eq("id", data.projectId)
      .single();
    if (!project) return { status: "not_found" as const };

    const screenshotUrl: string | null =
      (project as { preview_url?: string | null }).preview_url ?? null;

    const { data: currentFiles } = await (supabase as any)
      .from("project_files")
      .select("path, content, language")
      .eq("project_id", data.projectId);

    if (!currentFiles || currentFiles.length === 0) {
      return { status: "bad_request" as const, error: "No files to snapshot" };
    }

    const snapshotLabel = data.label ?? `Snapshot ${new Date().toLocaleString()}`;

    const { data: latest } = await (supabase as any)
      .from("project_snapshots")
      .select("id, is_baseline, files, patches")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const baselinePayload = (): Record<string, unknown> => ({
      project_id: data.projectId,
      user_id: user.id,
      label: snapshotLabel,
      is_baseline: true,
      files: currentFiles,
      patches: null,
      parent_id: null,
      screenshot_url: screenshotUrl,
    });

    let insertPayload: Record<string, unknown>;

    if (!latest) {
      insertPayload = baselinePayload();
    } else {
      let deltaPayload: Record<string, unknown> | undefined;
      try {
        let previousFiles: SnapshotFile[] | null = null;

        if (latest.is_baseline) {
          previousFiles = (latest.files ?? []) as SnapshotFile[];
        } else {
          const { data: chain, error: chainErr } = await (supabase as any).rpc(
            "get_snapshot_chain",
            { p_snapshot_id: latest.id },
          );
          if (chainErr || !chain?.length) {
            deltaPayload = baselinePayload();
          } else {
            previousFiles = reconstructFromChain(chain as SnapshotChainEntry[]);
          }
        }

        if (!deltaPayload && previousFiles) {
          const patches = computePatches(
            previousFiles,
            currentFiles as SnapshotFile[],
          );
          const chainDepth = await getChainDepth(supabase, latest.id);
          const forceBase = shouldStoreBaseline({
            hasPrevious: true,
            chainDepth,
            patchBytes: patchesSize(patches),
            fullBytes: filesSize(currentFiles as SnapshotFile[]),
          });

          if (forceBase || patches.length === 0) {
            deltaPayload = baselinePayload();
          } else {
            deltaPayload = {
              project_id: data.projectId,
              user_id: user.id,
              label: snapshotLabel,
              is_baseline: false,
              files: [],
              patches,
              parent_id: latest.id,
              screenshot_url: screenshotUrl,
            };
          }
        }
      } catch (chainError) {
        console.warn("[snapshots] delta unavailable, storing baseline:", chainError);
        deltaPayload = baselinePayload();
      }
      insertPayload = deltaPayload ?? baselinePayload();
    }

    const { data: snapshot, error } = await (supabase as any)
      .from("project_snapshots")
      .insert(insertPayload)
      .select("id, label, is_baseline, created_at, screenshot_url")
      .single();

    if (error) {
      console.error("[snapshots] insert failed:", error.message);
      return { status: "error" as const, message: error.message };
    }

    const changedCount = insertPayload.is_baseline
      ? currentFiles.length
      : (insertPayload.patches as FilePatch[]).length;

    return {
      status: "ok" as const,
      snapshot: {
        ...snapshot,
        changedFiles: changedCount,
        isDelta: !insertPayload.is_baseline,
      },
    };
}

export async function pinSnapshot(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const { data: snap } = await (supabase as any)
      .from("project_snapshots")
      .select("id, project_id")
      .eq("id", data.snapshotId)
      .single();
    if (!snap) return { status: "not_found" as const };

    const access = await getProjectAccess(supabase, snap.project_id, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    const { data: row, error } = await (supabase as any)
      .from("project_snapshots")
      .update({
        is_pinned: !!data.isPinned,
        pinned_at: data.isPinned ? new Date().toISOString() : null,
      })
      .eq("id", data.snapshotId)
      .select("id, is_pinned, pinned_at")
      .single();

    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, snapshot: row };
}

export async function deleteSnapshot(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const { data: snap } = await (supabase as any)
      .from("project_snapshots")
      .select("id, project_id")
      .eq("id", data.id)
      .single();
    if (!snap) return { status: "not_found" as const };

    const access = await getProjectAccess(supabase, snap.project_id, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    await (supabase as any).from("project_snapshots").delete().eq("id", data.id);
    return { status: "ok" as const, ok: true };
}

export async function restoreSnapshot(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    // Match Next: restore is owner-only.
    const { data: project } = await (supabase as any)
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", user.id)
      .single();
    if (!project) return { status: "not_found" as const, error: "Project not found" };

    const { data: snapMeta } = await (supabase as any)
      .from("project_snapshots")
      .select("id, label, user_id")
      .eq("id", data.snapshotId)
      .single();
    if (!snapMeta || snapMeta.user_id !== user.id) {
      return { status: "not_found" as const, error: "Snapshot not found" };
    }

    const { data: chain, error: chainErr } = await (supabase as any).rpc(
      "get_snapshot_chain",
      { p_snapshot_id: data.snapshotId },
    );
    if (chainErr) return { status: "error" as const, message: chainErr.message };

    const files = reconstructFromChain((chain ?? []) as SnapshotChainEntry[]);

    const { data: currentFiles } = await (supabase as any)
      .from("project_files")
      .select("path, content, language")
      .eq("project_id", data.projectId);

    const schemaChanges = detectSchemaChanges(
      (currentFiles ?? []) as Array<{ path: string; content: string }>,
      files as Array<{ path: string; content: string }>,
    );

    if (data.dryRun) {
      return {
        status: "ok" as const,
        kind: "dry_run" as const,
        dryRun: true,
        schemaChanges,
        hasSchemaChanges: schemaChanges.schemaPaths.length > 0,
        filesToChange: files.length,
        snapshotLabel: snapMeta.label,
      };
    }

    if (schemaChanges.schemaPaths.length > 0 && !data.confirmSchema) {
      return {
        status: "needs_confirm" as const,
        schemaChanges,
        message: "This restore would change SQL schema files. Confirm to proceed.",
      };
    }

    if (currentFiles && currentFiles.length > 0) {
      await (supabase as any).from("project_snapshots").insert({
        project_id: data.projectId,
        user_id: user.id,
        label: `Auto-save before restore to "${snapMeta.label}"`,
        is_baseline: true,
        files: currentFiles,
        patches: null,
        parent_id: null,
      });
    }

    await (supabase as any)
      .from("project_files")
      .delete()
      .eq("project_id", data.projectId);

    if (files.length > 0) {
      await (supabase as any).from("project_files").insert(
        files.map((f) => ({
          project_id: data.projectId,
          path: f.path,
          content: f.content,
          language: f.language,
        })),
      );
    }

    const { data: restoredFiles } = await (supabase as any)
      .from("project_files")
      .select("*")
      .eq("project_id", data.projectId);

    return {
      status: "ok" as const,
      kind: "restored" as const,
      files: restoredFiles ?? [],
      message: `Restored to "${snapMeta.label}"`,
    };
}
