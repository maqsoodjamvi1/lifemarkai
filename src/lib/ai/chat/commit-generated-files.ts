import type { createClientFromRequest } from "../../supabase/request-client.ts";
import { sanitizeGeneratedFile } from "../html-sanity.ts";
import type { ParsedFile } from "../code-parser.ts";

export async function commitGeneratedFiles(
  supabase: ReturnType<typeof createClientFromRequest>,
  projectId: string,
  files: ParsedFile[],
): Promise<ParsedFile[]> {
  const sanitizedFiles = files.map((file) => ({
    ...file,
    content: sanitizeGeneratedFile(file.path, file.content),
  }));
  const rpc = supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  };
  const { data: beginRows, error: beginError } = await rpc.rpc("begin_generation", {
    target_project_id: projectId,
    run_source: "chat",
  });
  if (!beginError) {
    const begin = Array.isArray(beginRows) ? beginRows[0] as Record<string, unknown> | undefined : undefined;
    const runId = typeof begin?.run_id === "string" ? begin.run_id : null;
    const baseRevision = Number(begin?.base_revision);
    if (!runId || !Number.isSafeInteger(baseRevision)) {
      throw new Error("Could not start transactional generation: invalid database response");
    }
    const { error: commitError } = await rpc.rpc("commit_generation", {
      target_run_id: runId,
      expected_revision: baseRevision,
      staged_files: sanitizedFiles.map((file) => ({
        path: file.path,
        content: file.content,
        language: file.language,
      })),
    });
    if (commitError) {
      if (commitError.code === "40001" || /generation conflict/i.test(commitError.message)) {
        throw new Error("This project changed while the AI was generating. Your newer files were preserved; retry the request against the latest revision.");
      }
      throw new Error(`Could not atomically save generated files: ${commitError.message}`);
    }
    return sanitizedFiles;
  }

  // Rolling deployment compatibility: migration 166 may reach the app database
  // shortly after the new server code. Only a genuinely missing RPC may use the
  // previous batch upsert; permission, validation, and network failures remain fatal.
  const rpcMissing = beginError.code === "PGRST202" || /begin_generation.*schema cache|function.*not found/i.test(beginError.message);
  if (!rpcMissing) throw new Error(`Could not start generated-file transaction: ${beginError.message}`);
  const { error } = await supabase.from("project_files").upsert(
    sanitizedFiles.map((file) => ({
      project_id: projectId,
      path: file.path,
      content: file.content,
      language: file.language,
    })),
    { onConflict: "project_id,path" },
  );
  if (error) throw new Error(`Could not save generated files: ${error.message}`);
  return sanitizedFiles;
}
