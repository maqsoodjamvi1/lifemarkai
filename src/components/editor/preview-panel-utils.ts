export type ProjectFileLike = { path: string; content: string; project_id?: string | null };

export function filesBelongToProject<T extends { project_id?: string | null }>(
  files: T[],
  projectId: string,
): boolean {
  if (!projectId || files.length === 0) return false;
  return !files.some(
    (f) => typeof f.project_id === "string" && f.project_id.length > 0 && f.project_id !== projectId,
  );
}

export function getRefreshEffectiveFiles<T extends ProjectFileLike>(
  versionPreviewLabel: string | null | undefined,
  filesProp: T[],
  nextFiles?: T[],
): T[] | undefined {
  return versionPreviewLabel ? filesProp : nextFiles;
}
