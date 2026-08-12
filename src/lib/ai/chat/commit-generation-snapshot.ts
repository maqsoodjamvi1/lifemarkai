import type { createClientFromRequest } from "../../supabase/request-client.ts";
import { sanitizeGeneratedFile } from "../html-sanity.ts";

export type SnapshotFile = { path: string; content: string; language?: string };

export async function commitGenerationSnapshot(
  supabase: ReturnType<typeof createClientFromRequest>,
  projectId: string,
  source: string,
  files: SnapshotFile[],
): Promise<SnapshotFile[]> {
  const staged = files.map((file) => ({
    ...file,
    content: sanitizeGeneratedFile(file.path, file.content),
    language: file.language ?? "text",
  }));
  const rpc = supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { code?: string; message: string } | null;
    }>;
  };
  const { data, error } = await rpc.rpc("begin_generation", {
    target_project_id: projectId,
    run_source: source,
  });
  if (error) throw new Error(`Could not start staged generation: ${error.message}`);
  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  const runId = typeof row?.run_id === "string" ? row.run_id : null;
  const baseRevision = Number(row?.base_revision);
  if (!runId || !Number.isSafeInteger(baseRevision)) throw new Error("Invalid staged generation response");
  const { error: commitError } = await rpc.rpc("commit_generation_snapshot", {
    target_run_id: runId,
    expected_revision: baseRevision,
    staged_files: staged,
  });
  if (commitError) throw new Error(`Could not activate verified generation: ${commitError.message}`);
  return staged;
}
