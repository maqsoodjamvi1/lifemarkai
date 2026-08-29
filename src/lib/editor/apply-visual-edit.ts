import type { ProjectFile } from "../../types/database.ts";

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
  /** Replace <img src> / background-image URL */
  imageSrc?: string;
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

  // ── Image src change ───────────────────────────────────────────────────────
  if (change.imageSrc !== undefined && change.imageSrc.trim()) {
    const src = change.imageSrc.trim();
    // Prefer matching an existing src that appears with this element's classes nearby
    const classHint = selection.classList.join(" ");
    for (const quote of ['"', "'"]) {
      const srcRe = new RegExp(`src=${quote}([^${quote}]*)${quote}`, "g");
      for (const file of sourceFiles) {
        const content = file.content as string;
        if (classHint && content.includes(classHint)) {
          // Replace first src in the same file that also contains the class hint nearby
          const idx = content.indexOf(classHint);
          const windowStart = Math.max(0, idx - 200);
          const windowEnd = Math.min(content.length, idx + classHint.length + 200);
          const slice = content.slice(windowStart, windowEnd);
          const m = slice.match(srcRe);
          if (m?.[0]) {
            const replacedSlice = slice.replace(m[0], `src=${quote}${src}${quote}`);
            return {
              path: file.path,
              content: content.slice(0, windowStart) + replacedSlice + content.slice(windowEnd),
            };
          }
        }
      }
    }
    // Unique src= URL if selection looks like an image tag
    if (selection.tagName === "img") {
      for (const quote of ['"', "'"]) {
        const matches = sourceFiles.flatMap((f) => {
          const re = new RegExp(`src=${quote}([^${quote}]+)${quote}`, "g");
          const found: Array<{ path: string; content: string; match: string }> = [];
          let m: RegExpExecArray | null;
          const c = f.content as string;
          while ((m = re.exec(c))) {
            found.push({ path: f.path, content: c, match: m[0] });
          }
          return found;
        });
        if (matches.length === 1) {
          const only = matches[0]!;
          return {
            path: only.path,
            content: only.content.replace(only.match, `src=${quote}${src}${quote}`),
          };
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
  if (change.imageSrc !== undefined) {
    parts.push(`Replace its image source (src / background-image) with: "${change.imageSrc}".`);
  }
  parts.push("Make only this change — do not modify anything else.");
  return parts.join(" ");
}

/** Merge per-side Tailwind spacing tokens into a class string. */
export function applySpacingToken(
  classes: string,
  kind: "m" | "p",
  side: "t" | "r" | "b" | "l" | "x" | "y" | "",
  scale: string,
): string {
  const prefix = side ? `${kind}${side}-` : `${kind}-`;
  const tokens = classes.split(/\s+/).filter(Boolean).filter((c) => !c.startsWith(prefix));
  tokens.push(`${prefix}${scale}`);
  return tokens.join(" ");
}

// The overlay's color tab previously offered only 12 fixed swatches per
// kind (TAILWIND_COLORS / BG_COLORS in visual-edit-overlay.tsx). These
// regexes recognize *those exact* named utilities so an arbitrary hex pick
// can replace one cleanly instead of stacking both classes on the element —
// Tailwind's JIT doesn't guarantee last-defined-wins for two utilities that
// both set the same CSS property, so leaving the old one in place would make
// the resulting color depend on generation order rather than the user's pick.
const NAMED_TEXT_COLOR_RE =
  /^text-(white|black|gray|red|blue|green|yellow|purple|pink|indigo|orange|teal)(-\d+)?$/;
const NAMED_BG_COLOR_RE =
  /^bg-(transparent|white|black|gray|blue|green|red|yellow|purple|indigo|pink|gradient-brand)(-\d+)?$/;
const HEX_RE = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

/** Normalize a hex color input (with or without a leading #) to `#rrggbb`/`#rgb`. */
export function normalizeHex(hex: string): string {
  return `#${hex.trim().replace(/^#/, "")}`;
}

/**
 * Replace any existing named-swatch or arbitrary color utility of `kind`
 * with an arbitrary-value utility for `hex` (e.g. `text-[#3b82f6]`). Silently
 * strips the old color and adds nothing new when `hex` isn't a valid hex
 * value, so a half-typed color input never corrupts the class string.
 */
export function applyArbitraryColorToken(classes: string, kind: "text" | "bg", hex: string): string {
  const namedRe = kind === "text" ? NAMED_TEXT_COLOR_RE : NAMED_BG_COLOR_RE;
  const arbitraryPrefix = `${kind}-[`;
  const tokens = classes
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !t.startsWith(arbitraryPrefix) && !namedRe.test(t));
  const trimmed = hex.trim();
  if (HEX_RE.test(trimmed)) tokens.push(`${kind}-[${normalizeHex(trimmed)}]`);
  return tokens.join(" ");
}

const FONT_FAMILY_CLASSES = new Set(["font-sans", "font-serif", "font-mono"]);

/**
 * Swap the element's Tailwind font-family utility (font-sans/serif/mono —
 * distinct from the font-WEIGHT utilities like font-bold, which are left
 * untouched). Passing a value outside the known family set just removes any
 * existing family utility, matching applyArbitraryColorToken's "strip on
 * invalid input" behavior.
 */
export function applyFontFamilyToken(classes: string, family: string): string {
  const tokens = classes.split(/\s+/).filter(Boolean).filter((t) => !FONT_FAMILY_CLASSES.has(t));
  if (FONT_FAMILY_CLASSES.has(family)) tokens.push(family);
  return tokens.join(" ");
}

/**
 * Merge an explicit pixel width/height into a class string as a Tailwind
 * arbitrary-value utility (`w-[240px]`), replacing any prior arbitrary
 * width/height so repeated resizes don't pile up dead classes. Backs the
 * visual-edit overlay's drag-resize handles.
 */
export function applyDimensionToken(classes: string, kind: "w" | "h", px: number): string {
  const prefix = `${kind}-[`;
  const tokens = classes.split(/\s+/).filter(Boolean).filter((t) => !t.startsWith(prefix));
  const clamped = Math.max(1, Math.round(px));
  tokens.push(`${kind}-[${clamped}px]`);
  return tokens.join(" ");
}
