import {
  patchFilesForWebContainer,
  type WebContainerPatchOpts,
} from "./patch-vite-for-webcontainer";

/** Vite host + VEB bridge + optional guest comments for cloud sandbox previews. */
export function patchSandboxPreviewFiles<T extends { path: string; content?: string | null }>(
  files: T[],
  opts?: WebContainerPatchOpts,
): T[] {
  return patchFilesForWebContainer(files, opts);
}
