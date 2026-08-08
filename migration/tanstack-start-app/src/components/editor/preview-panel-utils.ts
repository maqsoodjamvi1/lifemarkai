import type { ProjectFile } from "../../types/database.ts";

export function getRefreshEffectiveFiles(
  versionPreviewLabel: string | null | undefined,
  filesProp: ProjectFile[],
  nextFiles?: ProjectFile[],
): ProjectFile[] | undefined {
  return versionPreviewLabel ? filesProp : nextFiles;
}
