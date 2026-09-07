/** Write a healer-collapsed package.json back to the project so the next sync does not re-break the sandbox. */
export async function persistRepairedPackageJson(projectId: string, content: string): Promise<void> {
  if (!projectId || !content.trim().startsWith("{")) return;
  try {
    JSON.parse(content);
  } catch {
    return;
  }
  const { createAdminClient } = await import("@/lib/supabase/server");
  const supabase = createAdminClient();
  await supabase
    .from("project_files")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("path", "package.json");
}
