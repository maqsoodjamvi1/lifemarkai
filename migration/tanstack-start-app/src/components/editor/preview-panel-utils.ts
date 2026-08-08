export type ProjectFileLike = { path: string; content: string };

export function getRefreshEffectiveFiles<T extends ProjectFileLike>(
  versionPreviewLabel: string | null | undefined,
  filesProp: T[],
  nextFiles?: T[],
): T[] | undefined {
  return versionPreviewLabel ? filesProp : nextFiles;
}
