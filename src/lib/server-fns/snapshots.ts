/**
 * Native project snapshots — list / reconstruct / create / pin / delete / restore.
 */
import { createClient } from "../supabase/server.ts";
import { restoreProjectFilesAtomically } from "./restore-project-files.ts";
import { getServerUser } from "../supabase/server-user.ts";
import {
canReadProjectFiles,
canWriteProjectFiles,
getProjectAccess,
} from "@/lib/project/access";
import {
computePatches,
reconstructFromChain,
parseSnapshotChain,
parseSnapshotFiles,
filesSize,
patchesSize,
shouldStoreBaseline,
type SnapshotFile,
} from "@/lib/diff/snapshot-diff";
import type { Database,Json } from "../../types/database.ts";
import { computeNextCursor } from "@/lib/editor/snapshot-pagination";

const SNAPSHOT_PAGE_SIZE = 50;
const SNAPSHOT_PAGE_SIZE_MAX = 100;

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
      const { data: snap } = await supabase
        .from("project_snapshots")
        .select("id, user_id, project_id")
        .eq("id", data.id)
        .single();
      if (!snap) return { status: "not_found" as const };

      const access = await getProjectAccess(supabase, snap.project_id, user.id);
      if (!canReadProjectFiles(access)) return { status: "not_found" as const };

      const { data: chain, error } = await supabase.rpc(
        "get_snapshot_chain",
        { p_snapshot_id: data.id },
      );
      if (error) return { status: "error" as const, message: error.message };

      const files = reconstructFromChain(parseSnapshotChain(chain ?? []));
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

    // Unlimited scrollable history, like Lovable — rather than the old flat
    // cap of 50 that silently hid anything older. Pinned snapshots are
    // returned in full on every first page (there are normally few, and a
    // user expects every pin visible, not just the newest 50); only
    // non-pinned snapshots are paginated, by a created_at keyset cursor
    // (see src/lib/editor/snapshot-pagination.ts, unit tested).
    const limit = Math.min(
      Math.max(1, Number(data.limit) || SNAPSHOT_PAGE_SIZE),
      SNAPSHOT_PAGE_SIZE_MAX,
    );
    const cursor: string | null = typeof data.cursor === "string" && data.cursor ? data.cursor : null;
    const COLUMNS = "id, label, is_baseline, is_pinned, pinned_at, created_at, screenshot_url";

    const pinnedRows = cursor
      ? []
      : (
          await supabase
            .from("project_snapshots")
            .select(COLUMNS)
            .eq("project_id", data.projectId)
            .eq("is_pinned", true)
            .order("pinned_at", { ascending: false })
        ).data ?? [];

    let nonPinnedQuery = supabase
      .from("project_snapshots")
      .select(COLUMNS)
      .eq("project_id", data.projectId)
      .eq("is_pinned", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (cursor) nonPinnedQuery = nonPinnedQuery.lt("created_at", cursor);
    const nonPinnedRows = (await nonPinnedQuery).data ?? [];

    return {
      status: "ok" as const,
      kind: "list" as const,
      snapshots: [...pinnedRows, ...nonPinnedRows],
      nextCursor: computeNextCursor(nonPinnedRows, limit),
    };
}

export async function createSnapshot(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id, preview_url")
      .eq("id", data.projectId)
      .single();
    if (!project) return { status: "not_found" as const };

    const screenshotUrl: string | null =
      (project as { preview_url?: string | null }).preview_url ?? null;

    const { data: currentFiles } = await supabase
      .from("project_files")
      .select("path, content, language")
      .eq("project_id", data.projectId);

    if (!currentFiles || currentFiles.length === 0) {
      return { status: "bad_request" as const, error: "No files to snapshot" };
    }

    const snapshotLabel = data.label ?? `Snapshot ${new Date().toLocaleString()}`;

    const { data: latest } = await supabase
      .from("project_snapshots")
      .select("id, is_baseline, files, patches")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    type SnapshotInsert = Database["public"]["Tables"]["project_snapshots"]["Insert"];
    const baselinePayload = (): SnapshotInsert => ({
      project_id: data.projectId,
      user_id: user.id,
      label: snapshotLabel,
      is_baseline: true,
      files: currentFiles as unknown as Json,
      patches: null,
      parent_id: null,
      screenshot_url: screenshotUrl,
    });

    let insertPayload: SnapshotInsert;

    if (!latest) {
      insertPayload = baselinePayload();
    } else {
      let deltaPayload: SnapshotInsert | undefined;
      try {
        let previousFiles: SnapshotFile[] | null = null;

        if (latest.is_baseline) {
          previousFiles = parseSnapshotFiles(latest.files ?? []);
        } else {
          const { data: chain, error: chainErr } = await supabase.rpc(
            "get_snapshot_chain",
            { p_snapshot_id: latest.id },
          );
          const parsedChain = chainErr ? [] : parseSnapshotChain(chain ?? []);
          if (chainErr || parsedChain.length === 0) {
            deltaPayload = baselinePayload();
          } else {
            previousFiles = reconstructFromChain(parsedChain);
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
              files: [] as Json,
              patches: patches as unknown as Json,
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

    const { data: snapshot, error } = await supabase
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
      : Array.isArray(insertPayload.patches)
        ? insertPayload.patches.length
        : 0;

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

    const { data: snap } = await supabase
      .from("project_snapshots")
      .select("id, project_id")
      .eq("id", data.snapshotId)
      .single();
    if (!snap) return { status: "not_found" as const };

    const access = await getProjectAccess(supabase, snap.project_id, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    const { data: row, error } = await supabase
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

    const { data: snap } = await supabase
      .from("project_snapshots")
      .select("id, project_id")
      .eq("id", data.id)
      .single();
    if (!snap) return { status: "not_found" as const };

    const access = await getProjectAccess(supabase, snap.project_id, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    // The result was discarded and `ok: true` returned regardless, so a
    // rejected delete looked identical to a successful one — and the panel
    // then removed the row from its list optimistically, so the version
    // "disappeared" and came back on reload.
    const { error } = await supabase
      .from("project_snapshots")
      .delete()
      .eq("id", data.id);
    if (error) {
      return {
        status: "error" as const,
        message: error.message ?? "Could not delete this version.",
      };
    }
    return { status: "ok" as const, ok: true };
}

export async function restoreSnapshot(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const, error: "Project not found" };

    const { data: snapMeta } = await supabase
      .from("project_snapshots")
      .select("id, label, project_id")
      .eq("id", data.snapshotId)
      .eq("project_id", data.projectId)
      .single();
    if (!snapMeta) {
      return { status: "not_found" as const, error: "Snapshot not found" };
    }

    const { data: chain, error: chainErr } = await supabase.rpc(
      "get_snapshot_chain",
      { p_snapshot_id: data.snapshotId },
    );
    if (chainErr) return { status: "error" as const, message: chainErr.message };

    const files = reconstructFromChain(parseSnapshotChain(chain ?? []));

    const { data: currentFiles } = await supabase
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

    // This is the ONLY way back from what follows, and the worst-case error
    // message below explicitly promises the user it exists ("Your previous
    // version is saved as …"). Its result was discarded — and the scenario
    // where that matters is precisely one where writes to project_snapshots
    // are already failing, so the promise was most likely false at the exact
    // moment the project was empty. Refuse to start instead.
    if (currentFiles && currentFiles.length > 0) {
      const { error: autoSaveError } = await supabase
        .from("project_snapshots")
        .insert({
          project_id: data.projectId,
          user_id: user.id,
          label: `Auto-save before restore to "${snapMeta.label}"`,
          is_baseline: true,
          files: currentFiles,
          patches: null,
          parent_id: null,
        });
      if (autoSaveError) {
        return {
          status: "error" as const,
          message:
            "Could not save a restore point for your current files, so the restore was not started. Nothing has changed — try again in a moment.",
        };
      }
    }

    // ── Formerly the most destructive few lines in the codebase ──────────────
    //
    // This used to be delete-everything-then-insert, with no transaction and no
    // concurrency check — a raw two-step write straight to project_files. Every
    // failure mode of the insert left the project with ZERO FILES, and the
    // function used to report `status: "ok"` regardless — the client then
    // showed "Project reverted" over an empty project. Worse, the client's
    // `handleFilesUpdate` ignores an empty array, so the file tree still looked
    // populated and the user only discovered the loss on reload.
    //
    // WORSE, and the reason a real project was lost live: this path was the
    // ONLY writer to project_files that bypassed begin_generation/commit_generation
    // (see commit-generated-files.ts / commit-generation-snapshot.ts), the
    // revision-guarded RPC pair every AI generation commits through specifically
    // so a slow/still-running generation can never silently overwrite work that
    // happened after it started. A generation that began BEFORE the user clicked
    // Restore, but was still mid-flight (self-repair loop, multi-minute
    // continuation), captured `expected_revision` before the restore ran. Because
    // the raw delete+insert here never bumped that revision counter, the stale
    // generation's later `commit_generation` call saw an unchanged revision,
    // passed its own conflict check, and clobbered the just-restored files —
    // with no error, no toast, nothing: the restore looked like it silently did
    // nothing, and reopening History showed the same broken project. Observed
    // live: two Restore attempts on a corrupted ERP project (one explicit
    // "Restore failed", one silent no-op) that never actually recovered the
    // project. Routing through the SAME atomic, revision-checked RPC used by
    // every generation closes this: any generation racing a restore now hits
    // the existing 40001 conflict path instead of winning silently.
    //
    // Guards preserved from the old code, still necessary:
    //
    // 1. NEVER DELETE TOWARDS NOTHING. `reconstructFromChain` returns [] for a
    //    baseline whose `files` is an empty array — which passes the `!baseline.files`
    //    check upstream because [] is truthy. Restoring "nothing" is never what
    //    a user means by revert, so refuse before touching anything.
    // 2. VERIFY WHAT LANDED. A silent partial commit is indistinguishable from
    //    success at the API layer, so re-read and count rows before claiming victory.
    if (files.length === 0) {
      return {
        status: "error" as const,
        message:
          "That version contains no files, so restoring it would empty the project. Nothing was changed.",
      };
    }

    const writeResult = await restoreProjectFilesAtomically(
      supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }> },
      data.projectId,
      files as Array<{ path: string; content: string; language: string }>,
    );

    if (!writeResult.ok && writeResult.conflict) {
      return {
        status: "error" as const,
        message:
          "The project changed while this restore was running (an AI generation was still finishing), so nothing was overwritten. Your previous version is still saved — try Restore again now that it's settled.",
      };
    }

    if (!writeResult.ok && !writeResult.rpcMissing) {
      return { status: "error" as const, message: `Restore failed, nothing was changed: ${writeResult.message}` };
    }

    if (!writeResult.ok && writeResult.rpcMissing) {
      // Rolling deployment compatibility: only a genuinely missing RPC falls
      // back to the old raw write. Permission, validation, and network failures
      // are handled above and stay fatal rather than silently downgrading to
      // the unguarded path.
      const { error: deleteError } = await supabase.from("project_files").delete().eq("project_id", data.projectId);
      if (deleteError) {
        return {
          status: "error" as const,
          message: `Could not clear the current files, so nothing was changed: ${deleteError.message}`,
        };
      }
      const { error: insertError } = await supabase.from("project_files").insert(
        files.map((f) => ({ project_id: data.projectId, path: f.path, content: f.content, language: f.language })),
      );
      if (insertError) {
        let recovered = false;
        if (currentFiles && currentFiles.length > 0) {
          const { error: rollbackError } = await supabase.from("project_files").insert(
            currentFiles.map((f: { path: string; content: string; language?: string }) => ({
              project_id: data.projectId,
              path: f.path,
              content: f.content,
              language: f.language,
            })),
          );
          recovered = !rollbackError;
        }
        return {
          status: "error" as const,
          message: recovered
            ? `Restore failed and your files were put back unchanged: ${insertError.message}`
            : `Restore failed and the files could not be put back automatically: ${insertError.message}. Your previous version is saved as "Auto-save before restore to \\"${snapMeta.label}\\"" in version history.`,
        };
      }
    }

    const { data: restoredFiles } = await supabase
      .from("project_files")
      .select("*")
      .eq("project_id", data.projectId);

    if (!restoredFiles || restoredFiles.length === 0) {
      return {
        status: "error" as const,
        message:
          "The restore did not write any files. Your previous version is saved in version history — please reload before making further changes.",
      };
    }

    return {
      status: "ok" as const,
      kind: "restored" as const,
      files: restoredFiles,
      message: `Restored to "${snapMeta.label}"`,
    };
}
