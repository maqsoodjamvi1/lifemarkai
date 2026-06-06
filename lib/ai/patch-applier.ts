/**
 * Patch applier for targeted AI file edits.
 *
 * In "patch" mode the AI returns a JSON array of patch objects instead of
 * full file contents.  Each patch describes a targeted find-and-replace
 * operation on a single file, dramatically reducing token usage for small edits.
 *
 * Patch format:
 * [
 *   {
 *     "path": "src/components/Button.tsx",
 *     "find": "const color = 'blue';",
 *     "replace": "const color = 'green';",
 *     "description": "Change button color to green"
 *   },
 *   ...
 * ]
 *
 * If `find` is an empty string the replace content is appended to the file.
 * If `find` is null / omitted the entire file is replaced (full rewrite).
 */

export interface FilePatch {
  /** Relative file path */
  path: string;
  /**
   * The exact string to find in the existing file.
   * - Omit / null → full file replacement (replace = new content)
   * - "" (empty string) → append replace to end of file
   */
  find?: string | null;
  /** Replacement text */
  replace: string;
  /** Human-readable description (optional, used in UI) */
  description?: string;
}

export interface PatchResult {
  path: string;
  /** Updated file content after the patch was applied */
  content: string;
  /** Whether the patch was applied successfully */
  applied: boolean;
  /** Reason if the patch could not be applied */
  error?: string;
}

/**
 * Apply a list of patches to the given project files.
 *
 * Files not present in `existingFiles` are created with `replace` as their
 * full content.  Returns the patched file entries so callers can upsert them.
 */
export function applyPatches(
  patches: FilePatch[],
  existingFiles: Array<{ path: string; content: string }>
): PatchResult[] {
  const fileMap = new Map(existingFiles.map((f) => [f.path, f.content]));
  const results: PatchResult[] = [];

  for (const patch of patches) {
    const current = fileMap.get(patch.path) ?? "";

    // ── Full replacement ───────────────────────────────────────────────────
    if (patch.find === null || patch.find === undefined) {
      const updated = patch.replace;
      fileMap.set(patch.path, updated);
      results.push({ path: patch.path, content: updated, applied: true });
      continue;
    }

    // ── Append ────────────────────────────────────────────────────────────
    if (patch.find === "") {
      const updated = current + "\n" + patch.replace;
      fileMap.set(patch.path, updated);
      results.push({ path: patch.path, content: updated, applied: true });
      continue;
    }

    // ── Find-and-replace ──────────────────────────────────────────────────
    if (!current.includes(patch.find)) {
      // Try a whitespace-normalised match as a fallback
      const normalised = normaliseWhitespace(current);
      const normFind = normaliseWhitespace(patch.find);
      if (!normalised.includes(normFind)) {
        results.push({
          path: patch.path,
          content: current,
          applied: false,
          error: `find string not found in ${patch.path}`,
        });
        continue;
      }
      // Apply the normalised match — find the raw range and replace
      const idx = normalised.indexOf(normFind);
      const rawIdx = mapNormalisedIndexToRaw(current, idx);
      const rawEnd = mapNormalisedIndexToRaw(current, idx + normFind.length);
      const updated = current.slice(0, rawIdx) + patch.replace + current.slice(rawEnd);
      fileMap.set(patch.path, updated);
      results.push({ path: patch.path, content: updated, applied: true });
      continue;
    }

    // Exact match — replace first occurrence
    const updated = current.replace(patch.find, patch.replace);
    fileMap.set(patch.path, updated);
    results.push({ path: patch.path, content: updated, applied: true });
  }

  return results;
}

/**
 * Parse a raw AI response string into a list of FilePatch objects.
 * Handles the AI wrapping the JSON in a ```json code fence.
 */
export function parsePatchResponse(raw: string): FilePatch[] {
  // Strip JSON code fences if present
  const stripped = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  // Find the outermost JSON array
  const arrStart = stripped.indexOf("[");
  const arrEnd = stripped.lastIndexOf("]");
  if (arrStart === -1 || arrEnd === -1) return [];

  try {
    const parsed = JSON.parse(stripped.slice(arrStart, arrEnd + 1));
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(isFilePatch);
  } catch {
    return [];
  }
}

function isFilePatch(v: unknown): v is FilePatch {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).path === "string" &&
    typeof (v as Record<string, unknown>).replace === "string"
  );
}

/** Collapse all runs of whitespace to a single space for fuzzy matching */
function normaliseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ");
}

/**
 * Map a character index in the normalised string back to the original string.
 * This is a best-effort approximation used for the normalised fallback path.
 */
function mapNormalisedIndexToRaw(original: string, normIdx: number): number {
  let rawPos = 0;
  let normPos = 0;
  let inWhitespace = false;

  while (rawPos < original.length && normPos < normIdx) {
    const ch = original[rawPos]!;
    const isWs = /\s/.test(ch);

    if (isWs) {
      if (!inWhitespace) {
        // This run of whitespace = 1 space in normalised
        normPos++;
        inWhitespace = true;
      }
    } else {
      normPos++;
      inWhitespace = false;
    }
    rawPos++;
  }

  return rawPos;
}
