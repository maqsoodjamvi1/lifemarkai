import type { createClientFromRequest } from "../../supabase/request-client.ts";
import { sanitizeGeneratedFile } from "../html-sanity.ts";
import { enforceGeneratedFileContract } from "../generated-file-contract.ts";
import { sanitizePackageJsonDependencies } from "../package-allowlist.ts";

export type SnapshotFile = { path: string; content: string; language?: string };

/**
 * Agent Mode's commit path. Previously this skipped the entire safety
 * contract that the chat/build commit path (commitGeneratedFiles) enforces:
 * no path-traversal/absolute-path rejection, no ".env"/"id_rsa"/private-key
 * filename block, no reserved-root (node_modules, .git, dist, ...) block, no
 * size cap. A model driven by prompt-injected content (or simply asked to)
 * could call the agent's write_file tool with a path like ".env" or
 * "../../outside" and have it committed verbatim — rejected outright on the
 * chat/build path, silently accepted here. enforceGeneratedFileContract is
 * now applied here too, so both commit paths share one safety boundary.
 * package.json additionally goes through sanitizePackageJsonDependencies —
 * the allowlist gate elsewhere in this codebase only checks NEWLY-imported
 * packages against the allowlist; it never re-validates dependencies a
 * write_file call declared directly, so a package.json committed here could
 * previously ship an arbitrary/typosquatted dependency straight to the
 * sandbox's unconditional `npm install`.
 */
export async function commitGenerationSnapshot(
  supabase: ReturnType<typeof createClientFromRequest>,
  projectId: string,
  source: string,
  files: SnapshotFile[],
): Promise<SnapshotFile[]> {
  const sanitized = files.map((file) => ({
    ...file,
    content:
      file.path === "package.json" || file.path.endsWith("/package.json")
        ? sanitizePackageJsonDependencies(sanitizeGeneratedFile(file.path, file.content))
        : sanitizeGeneratedFile(file.path, file.content),
    language: file.language ?? "text",
  }));
  const staged = enforceGeneratedFileContract(sanitized);
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
