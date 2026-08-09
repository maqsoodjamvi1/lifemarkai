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
