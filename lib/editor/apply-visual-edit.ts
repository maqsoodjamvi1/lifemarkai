import type { ProjectFile } from "@/types/database";

export interface VisualEditSelection {
  tagName: string;
  textContent: string;
  classList: string[];
}

export interface VisualEditChange {
  /** New text content for the element */
  text?: string;
  /** Full replacement className string */
  classes?: string;
}

/**
 * Apply a visual edit to project source files.
 *
 * Searches ALL component files (not just App.tsx) for the selected element's
 * exact className string or text content and rewrites the first match.
 * Returns the updated file, or null when no confident match was found —
 * callers should then fall back to an AI edit prompt.
 */
export function applyVisualEdit(
  files: ProjectFile[],
  selection: VisualEditSelection,
  change: VisualEditChange
): { path: string; content: string } | null {
  const sourceFiles = files.filter((f) =>
    /\.(tsx|jsx|ts|js|html)$/.test(f.path) && typeof f.content === "string"
  );

  // ── Class change: find the exact className attribute ──────────────────────
  if (change.classes !== undefined) {
    const target = selection.classList.join(" ");
    if (target.trim()) {
      for (const quote of ['"', "'"]) {
        for (const attr of ["className", "class"]) {
          const needle = `${attr}=${quote}${target}${quote}`;
          const file = uniqueFileContaining(sourceFiles, needle);
          if (file) {
            return {
              path: file.path,
              content: (file.content as string).replace(
                needle,
                `${attr}=${quote}${change.classes}${quote}`
              ),
            };
          }
        }
      }
    }
  }

  // ── Text change: find the exact text content ───────────────────────────────
  if (change.text !== undefined && selection.textContent.trim()) {
    const target = selection.textContent.trim();
    // Prefer JSX text node form (>text<) to avoid clobbering attribute values
    const jsxNeedle = `>${target}<`;
    let file = uniqueFileContaining(sourceFiles, jsxNeedle);
    if (file) {
      return {
        path: file.path,
        content: (file.content as string).replace(jsxNeedle, `>${change.text}<`),
      };
    }
    // Fall back to a raw unique match (string literals, template chunks)
    file = uniqueFileContaining(sourceFiles, target);
    if (file) {
      return {
        path: file.path,
        content: (file.content as string).replace(target, change.text),
      };
    }
  }

  return null;
}

/**
 * Returns the file containing `needle` if the match is unambiguous:
 * exactly one file contains it, and only once within that file.
 * (Several files or several occurrences → too risky to auto-edit.)
 */
function uniqueFileContaining(
  files: ProjectFile[],
  needle: string
): ProjectFile | null {
  let found: ProjectFile | null = null;
  for (const f of files) {
    const content = f.content as string;
    const first = content.indexOf(needle);
    if (first === -1) continue;
    if (found) return null; // present in multiple files
    if (content.indexOf(needle, first + 1) !== -1) return null; // multiple in one file
    found = f;
  }
  return found;
}

/** Build a precise AI prompt for edits the deterministic matcher can't apply. */
export function buildVisualEditPrompt(
  selection: VisualEditSelection,
  change: VisualEditChange
): string {
  const parts: string[] = [
    `Visual edit request for the <${selection.tagName}> element` +
      (selection.textContent ? ` with text "${selection.textContent.slice(0, 80)}"` : "") +
      (selection.classList.length ? ` and classes "${selection.classList.join(" ")}"` : "") +
      ".",
  ];
  if (change.text !== undefined) parts.push(`Change its text to: "${change.text}".`);
  if (change.classes !== undefined) parts.push(`Change its className to: "${change.classes}".`);
  parts.push("Make only this change — do not modify anything else.");
  return parts.join(" ");
}
