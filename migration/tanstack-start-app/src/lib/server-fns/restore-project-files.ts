/**
 * Atomically replace a project's files during a snapshot restore.
 *
 * Extracted from restoreSnapshot() so the revision-conflict behavior (the fix
 * for a real data-loss bug — see the long comment at the restoreSnapshot call
 * site) is independently testable with an injected client, the same way
 * commit-generated-files.ts / commit-generation-snapshot.ts already are.
 *
 * Routes through begin_generation/commit_generation — the SAME revision-guarded
 * RPC pair every AI generation commits through — instead of a raw delete+insert.
 * That closes the race where a generation that started before a user clicked
 * Restore, but was still mid-flight, could silently overwrite the just-restored
 * files because the old raw write never bumped the revision counter the
 * generation's own conflict check was validating against.
 */
export interface RestoreFile {
  path: string;
  content: string;
  language: string;
}

export type RestoreWriteResult =
  | { ok: true }
  | { ok: false; conflict: true; message: string }
  | { ok: false; conflict: false; message: string; rpcMissing?: boolean };

interface MinimalRpcClient {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}

export async function restoreProjectFilesAtomically(
  supabase: MinimalRpcClient,
  projectId: string,
  files: RestoreFile[],
): Promise<RestoreWriteResult> {
  const { data: beginRows, error: beginError } = await supabase.rpc("begin_generation", {
    target_project_id: projectId,
    run_source: "restore",
  });

  if (beginError) {
    const rpcMissing =
      beginError.code === "PGRST202" || /begin_generation.*schema cache|function.*not found/i.test(beginError.message);
    return { ok: false, conflict: false, message: beginError.message, rpcMissing };
  }

  const begin = Array.isArray(beginRows) ? (beginRows[0] as Record<string, unknown> | undefined) : undefined;
  const runId = typeof begin?.run_id === "string" ? begin.run_id : null;
  const baseRevision = Number(begin?.base_revision);
  if (!runId || !Number.isSafeInteger(baseRevision)) {
    return { ok: false, conflict: false, message: "invalid database response" };
  }

  const { error: commitError } = await supabase.rpc("commit_generation", {
    target_run_id: runId,
    expected_revision: baseRevision,
    staged_files: files.map((f) => ({ path: f.path, content: f.content, language: f.language })),
  });

  if (commitError) {
    const conflict = commitError.code === "40001" || /generation conflict/i.test(commitError.message);
    return { ok: false, conflict, message: commitError.message };
  }

  return { ok: true };
}
