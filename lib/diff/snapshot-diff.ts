/**
 * File-level delta computation for incremental snapshot storage.
 *
 * Instead of storing full file arrays on every snapshot, we store only the
 * files that changed, added, or were removed since the previous snapshot.
 *
 * Patch format (RFC 6902-inspired, file-level granularity):
 *   { op: "add",     path, content, language }  — new file
 *   { op: "replace", path, content, language }  — modified file
 *   { op: "remove",  path }                     — deleted file
 *
 * Savings: ~80–95% for typical iterative AI edits that touch 1–3 files.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SnapshotFile {
  path:     string;
  content:  string;
  language: string;
}

export type PatchOp = "add" | "replace" | "remove";

export interface FilePatch {
  op:        PatchOp;
  path:      string;
  content?:  string;   // present for add / replace
  language?: string;   // present for add / replace
}

export type FileMap = Map<string, Omit<SnapshotFile, "path">>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert an array of files to a Map keyed by path for O(1) lookup */
export function toFileMap(files: SnapshotFile[]): FileMap {
  return new Map(files.map(({ path, content, language }) => [path, { content, language }]));
}

/** Convert a FileMap back to a sorted array */
export function fromFileMap(map: FileMap): SnapshotFile[] {
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, { content, language }]) => ({ path, content, language }));
}

// ── Core diff ─────────────────────────────────────────────────────────────────

/**
 * Compute the minimal set of patches to go from `oldFiles` → `newFiles`.
 * Returns an empty array if the file sets are identical.
 */
export function computePatches(
  oldFiles: SnapshotFile[],
  newFiles: SnapshotFile[]
): FilePatch[] {
  const oldMap = toFileMap(oldFiles);
  const newMap = toFileMap(newFiles);
  const patches: FilePatch[] = [];

  // Files in newMap: added or replaced
  for (const [path, { content, language }] of newMap) {
    const old = oldMap.get(path);
    if (!old) {
      patches.push({ op: "add", path, content, language });
    } else if (old.content !== content) {
      patches.push({ op: "replace", path, content, language });
    }
    // Unchanged files: skip
  }

  // Files in oldMap but not newMap: removed
  for (const [path] of oldMap) {
    if (!newMap.has(path)) {
      patches.push({ op: "remove", path });
    }
  }

  return patches;
}

/**
 * Apply a list of patches to a base FileMap, returning the updated map.
 * Pure function — does not mutate the input.
 */
export function applyPatches(base: FileMap, patches: FilePatch[]): FileMap {
  const result = new Map(base);

  for (const patch of patches) {
    switch (patch.op) {
      case "add":
      case "replace":
        result.set(patch.path, { content: patch.content!, language: patch.language! });
        break;
      case "remove":
        result.delete(patch.path);
        break;
    }
  }

  return result;
}

// ── Chain reconstruction ──────────────────────────────────────────────────────

export interface SnapshotChainEntry {
  id:          string;
  is_baseline: boolean;
  files:       SnapshotFile[] | null;    // non-null for baselines
  patches:     FilePatch[]    | null;    // non-null for deltas
}

/**
 * Reconstruct the full file list for a snapshot from its ancestor chain.
 *
 * @param chain  Entries sorted oldest-first (baseline → ... → target snapshot)
 * @returns      Reconstructed file array at the target snapshot state
 * @throws       If no baseline is found in the chain
 */
export function reconstructFromChain(chain: SnapshotChainEntry[]): SnapshotFile[] {
  if (chain.length === 0) throw new Error("Empty snapshot chain");

  const baseline = chain[0];
  if (!baseline.is_baseline || !baseline.files) {
    throw new Error("Chain does not start with a baseline snapshot");
  }

  let current = toFileMap(baseline.files);

  for (const entry of chain.slice(1)) {
    if (!entry.patches) continue;
    current = applyPatches(current, entry.patches);
  }

  return fromFileMap(current);
}

// ── Storage size estimation ───────────────────────────────────────────────────

/** Returns the uncompressed byte size of the patches JSON */
export function patchesSize(patches: FilePatch[]): number {
  return JSON.stringify(patches).length;
}

/** Returns the uncompressed byte size of a full file array */
export function filesSize(files: SnapshotFile[]): number {
  return JSON.stringify(files).length;
}

/**
 * Decide whether to store a delta or force a new baseline.
 * Force a baseline when:
 *   - No previous snapshot exists
 *   - The delta chain is already too long (>= maxChainDepth)
 *   - The patches are bigger than the full files (e.g. bulk regeneration)
 */
export function shouldStoreBaseline(opts: {
  hasPrevious:    boolean;
  chainDepth:     number;
  maxChainDepth?: number;
  patchBytes:     number;
  fullBytes:      number;
}): boolean {
  const { hasPrevious, chainDepth, maxChainDepth = 20, patchBytes, fullBytes } = opts;
  if (!hasPrevious) return true;
  if (chainDepth >= maxChainDepth) return true;
  if (patchBytes >= fullBytes * 0.9) return true; // delta barely smaller than full
  return false;
}
