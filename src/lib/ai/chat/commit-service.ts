import type { createClientFromRequest } from "../../supabase/request-client.ts";
import { pushFileToRunningSandbox } from "../../preview/push-to-sandbox.ts";
import type { ParsedFile } from "../code-parser.ts";
import { commitGeneratedFiles } from "./commit-generated-files.ts";

/**
 * Atomically publish a verified candidate, then mirror the committed files to
 * the already-running preview. Canonical persistence always completes first.
 */
export async function commitGenerationStage(
  supabase: ReturnType<typeof createClientFromRequest>,
  projectId: string,
  files: ParsedFile[],
): Promise<ParsedFile[]> {
  const committed = await commitGeneratedFiles(supabase, projectId, files);
  for (const file of committed) {
    void pushFileToRunningSandbox(
      supabase,
      projectId,
      file.path,
      file.content,
    );
  }
  return committed;
}
