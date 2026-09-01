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
 * Patches to the same path are applied sequentially (later patches see earlier
 * results). Files not present in `existingFiles` are created with `replace`
 * as their full content. Returns one result per patch attempt; for upserts
 * prefer `collapsePatchResults()` so intermediate same-path states are not
 * written over the final content.
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
      // Ambiguity is a failure here too — see the uniqueness note below. A
      // whitespace-flexible match that hits several sites is even less safe than
      // an exact one, because the raw-index mapping is approximate.
      if (normalised.indexOf(normFind) !== normalised.lastIndexOf(normFind)) {
        results.push({
          path: patch.path,
          content: current,
          applied: false,
          error: `find string is ambiguous in ${patch.path} (matches more than once, ignoring whitespace) — include more surrounding context so it is unique`,
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

    // UNIQUENESS. PATCH_SYSTEM_PROMPT tells the model that `find` must be copied
    // verbatim WITH 3-5 surrounding lines "so it is unique". Nothing enforced
    // that: this did `current.replace(patch.find, ...)`, which silently edits the
    // FIRST occurrence. A `find` matching several sites therefore patched an
    // arbitrary one, reported applied: true, and the user was told it worked —
    // the wrong-location half of the "patches miss" class.
    //
    // agent.ts edit_file and xml-stream-parser both already reject ambiguous
    // matches; this applier was the odd one out. Failing here is safe: chat.ts
    // treats an unapplied patch as a miss and falls back to a full build.
    if (current.indexOf(patch.find) !== current.lastIndexOf(patch.find)) {
      results.push({
        path: patch.path,
        content: current,
        applied: false,
        error: `find string is ambiguous in ${patch.path} (appears more than once) — include more surrounding context so it is unique`,
      });
      continue;
    }

    // Exact, unique match. NOT current.replace(patch.find, patch.replace) —
    // String.prototype.replace treats $&, $`, $', $$ in a STRING replacement
    // argument as special substitution patterns (the same as with a regex
    // search), not literal text. A model-generated replacement containing a
    // real-world idiom like the thousand-separator pattern '$&,' would have
    // $& expanded to the entire matched find-block and spliced verbatim into
    // the output — corrupting the saved file while the live streaming
    // preview (xml-stream-parser.ts's applySearchReplace, which already uses
    // slice()) showed the correct edit. We already know the match is unique
    // and its position (checked just above), so slice+concat applies it
    // literally with no special-character interpretation.
    const idx = current.indexOf(patch.find);
    const updated = current.slice(0, idx) + patch.replace + current.slice(idx + patch.find.length);
    fileMap.set(patch.path, updated);
    results.push({ path: patch.path, content: updated, applied: true });
  }

  return results;
}

/**
 * Collapse per-patch results to the final content per path.
 * Only includes paths that had at least one successful apply.
 */
export function collapsePatchResults(results: PatchResult[]): PatchResult[] {
  const byPath = new Map<string, PatchResult>();
  for (const r of results) {
    if (!r.applied) continue;
    byPath.set(r.path, r); // last successful write wins (already sequential)
  }
  return [...byPath.values()];
}

/**
 * Parse a raw AI response string into a list of FilePatch objects.
 * Accepts:
 *   - {"patches":[...]}  (preferred — works with OpenAI json_object mode)
 *   - bare [...] array   (legacy)
 * Also tolerates markdown fences and trailing commas.
 */
export function parsePatchResponse(raw: string): FilePatch[] {
  const stripped = raw
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  // Prefer object wrapper first (json_object mode)
  const objStart = stripped.indexOf("{");
  const objEnd = stripped.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    const objText = stripped.slice(objStart, objEnd + 1).replace(/,\s*([\]}])/g, "$1");
    try {
      const parsed = JSON.parse(objText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const rec = parsed as Record<string, unknown>;
        const list = rec.patches ?? rec.edits ?? rec.changes ?? rec.files;
        if (Array.isArray(list)) {
          return (list as unknown[]).filter(isFilePatch);
        }
      }
    } catch {
      /* fall through to array parse */
    }
  }

  const arrStart = stripped.indexOf("[");
  const arrEnd = stripped.lastIndexOf("]");
  if (arrStart === -1 || arrEnd === -1 || arrEnd <= arrStart) return [];

  const jsonText = stripped.slice(arrStart, arrEnd + 1).replace(/,\s*([\]}])/g, "$1");
  try {
    const parsed = JSON.parse(jsonText);
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
