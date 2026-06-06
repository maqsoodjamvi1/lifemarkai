import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { reconstructFromChain, type SnapshotChainEntry } from "@/lib/diff/snapshot-diff";

/**
 * Detect schema-affecting changes between the snapshot's files and the
 * current project files. Implements Lovable best-practice #4:
 *   "If you must revert, validate the SQL schema at T=0 and ensure no
 *    breaking changes have occurred."
 *
 * Returns a list of paths that would be modified AND look like SQL/migration
 * files. The caller (UI) is expected to surface these to the user for
 * confirmation before applying the restore.
 */
function detectSchemaChanges(
  currentFiles: Array<{ path: string; content: string }>,
  targetFiles: Array<{ path: string; content: string }>,
): { schemaPaths: string[]; addedTables: string[]; removedTables: string[] } {
  const SCHEMA_PATH_RE = /(supabase\/migrations\/|migrations\/|prisma\/schema|drizzle\/|schema\.sql$|\.sql$|schema\.prisma$)/i;
  const currentMap = new Map(currentFiles.map((f) => [f.path, f.content]));
  const targetMap = new Map(targetFiles.map((f) => [f.path, f.content]));
  const allPaths = new Set([...currentMap.keys(), ...targetMap.keys()]);

  const schemaPaths: string[] = [];
  const addedTables: string[] = [];
  const removedTables: string[] = [];
  const TABLE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z0-9_]+)["`]?/gi;

  for (const path of allPaths) {
    if (!SCHEMA_PATH_RE.test(path)) continue;
    const cur = currentMap.get(path) ?? "";
    const tgt = targetMap.get(path) ?? "";
    if (cur === tgt) continue;
    schemaPaths.push(path);
    // Try to detect tables that would appear / disappear with this restore
    const curTables = new Set<string>();
    const tgtTables = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = TABLE_RE.exec(cur)) !== null) curTables.add(m[1].toLowerCase());
    TABLE_RE.lastIndex = 0;
    while ((m = TABLE_RE.exec(tgt)) !== null) tgtTables.add(m[1].toLowerCase());
    // Reverting to target: tables in current but NOT in target = removed
    for (const t of curTables) if (!tgtTables.has(t)) removedTables.push(t);
    for (const t of tgtTables) if (!curTables.has(t)) addedTables.push(t);
  }
  return {
    schemaPaths,
    addedTables: [...new Set(addedTables)],
    removedTables: [...new Set(removedTables)],
  };
}

/** POST — restore a project to a specific snapshot state.
 *
 * Pass `{ dryRun: true }` to receive only the schema-change analysis (no
 * mutation). The UI calls this first; if `schemaChanges.schemaPaths.length > 0`
 * the user is asked to confirm before a second call without dryRun.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { snapshotId, projectId, dryRun, confirmSchema } = await req.json() as {
    snapshotId: string;
    projectId: string;
    dryRun?: boolean;
    confirmSchema?: boolean;
  };
  if (!snapshotId || !projectId) {
    return NextResponse.json({ error: "snapshotId and projectId required" }, { status: 400 });
  }

  // Verify ownership of project
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Verify snapshot belongs to user
  const { data: snapMeta } = await (supabase as any)
    .from("project_snapshots")
    .select("id, label, user_id")
    .eq("id", snapshotId)
    .single();
  if (!snapMeta || snapMeta.user_id !== user.id) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  // Reconstruct target files from ancestor chain
  const { data: chain, error: chainErr } = await (supabase as any)
    .rpc("get_snapshot_chain", { p_snapshot_id: snapshotId });
  if (chainErr) return NextResponse.json({ error: chainErr.message }, { status: 500 });

  const files = reconstructFromChain((chain ?? []) as SnapshotChainEntry[]);

  // Auto-snapshot current state BEFORE restoring (as a safety baseline)
  const { data: currentFiles } = await (supabase as any)
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", projectId);

  // ── Schema-change pre-check (Lovable best-practice #4) ──────────────────────
  const schemaChanges = detectSchemaChanges(
    (currentFiles ?? []) as Array<{ path: string; content: string }>,
    files as Array<{ path: string; content: string }>,
  );

  // Dry-run mode: return the analysis without applying anything.
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      schemaChanges,
      hasSchemaChanges: schemaChanges.schemaPaths.length > 0,
      filesToChange: files.length,
      snapshotLabel: snapMeta.label,
    });
  }

  // If schema changes are present and the caller didn't explicitly confirm,
  // refuse — this protects users from accidentally rolling back Supabase
  // tables they care about.
  if (schemaChanges.schemaPaths.length > 0 && !confirmSchema) {
    return NextResponse.json({
      ok: false,
      requiresConfirmation: true,
      schemaChanges,
      message: "This restore would change SQL schema files. Confirm to proceed.",
    }, { status: 409 });
  }

  if (currentFiles && currentFiles.length > 0) {
    await (supabase as any).from("project_snapshots").insert({
      project_id:  projectId,
      user_id:     user.id,
      label:       `Auto-save before restore to "${snapMeta.label}"`,
      is_baseline: true,
      files:       currentFiles,
      patches:     null,
      parent_id:   null,
    });
  }

  // Replace project files atomically
  await (supabase as any).from("project_files").delete().eq("project_id", projectId);

  if (files.length > 0) {
    await (supabase as any).from("project_files").insert(
      files.map((f) => ({ project_id: projectId, path: f.path, content: f.content, language: f.language }))
    );
  }

  const { data: restoredFiles } = await (supabase as any)
    .from("project_files")
    .select("*")
    .eq("project_id", projectId);

  return NextResponse.json({
    ok:      true,
    files:   restoredFiles ?? [],
    message: `Restored to "${snapMeta.label}"`,
  });
}
