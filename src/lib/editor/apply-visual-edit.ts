import type { ProjectFile } from "../../types/database.ts";

export interface VisualEditSelection {
  tagName: string;
  textContent: string;
  classList: string[];
  /** Preview-bridge hint (React _debugSource / data-source-file). */
  sourceFile?: string | null;
  sourceLine?: number | null;
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
  const allSource = files.filter((f) =>
    /\.(tsx|jsx|ts|js|html)$/.test(f.path) && typeof f.content === "string"
  );
  const sourceFiles = scopedSourceFiles(allSource, selection);

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
    const injected = injectClassOnUniqueElement(sourceFiles, selection, change.classes);
    if (injected) return injected;
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
    const near = replaceTextNearClassHint(sourceFiles, selection, change.text);
    if (near) return near;
    const atLine = replaceTextNearSourceLine(sourceFiles, selection, change.text);
    if (atLine) return atLine;
  }

  return null;
}

/** When `>text<` appears more than once, rewrite the occurrence next to this element's classes. */
function replaceTextNearClassHint(
  files: ProjectFile[],
  selection: VisualEditSelection,
  newText: string,
): { path: string; content: string } | null {
  const hint = selection.classList.join(" ").trim();
  const oldText = selection.textContent.trim();
  if (!hint || !oldText) return null;
  const needle = `>${oldText}<`;
  const replacement = `>${newText}<`;
  let found: { path: string; content: string } | null = null;
  for (const file of files) {
    const content = file.content as string;
    if (!content.includes(hint) || !content.includes(needle)) continue;
    const idx = content.indexOf(hint);
    const afterHint = content.slice(idx + hint.length, idx + hint.length + 180);
    const rel = afterHint.indexOf(needle);
    if (rel === -1) continue;
    if (found) return null;
    const abs = idx + hint.length + rel;
    found = {
      path: file.path,
      content: content.slice(0, abs) + replacement + content.slice(abs + needle.length),
    };
  }
  return found;
}

function replaceTextNearSourceLine(
  files: ProjectFile[],
  selection: VisualEditSelection,
  newText: string,
): { path: string; content: string } | null {
  const oldText = selection.textContent.trim();
  if (!oldText) return null;
  const needle = `>${oldText}<`;
  const replacement = `>${newText}<`;
  for (const file of files) {
    const content = file.content as string;
    const idx = occurrenceIndexNearLine(content, needle, selection.sourceLine);
    if (idx < 0) continue;
    return {
      path: file.path,
      content: content.slice(0, idx) + replacement + content.slice(idx + needle.length),
    };
  }
  return null;
}

function scopedSourceFiles(
  files: ProjectFile[],
  selection: VisualEditSelection,
): ProjectFile[] {
  const hint = (selection.sourceFile ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!hint) return files;
  const hit =
    files.find((f) => f.path === hint) ??
    files.find((f) => f.path.endsWith("/" + hint)) ??
    files.find((f) => hint.endsWith("/" + f.path));
  return hit ? [hit] : files;
}

function occurrenceIndexNearLine(
  content: string,
  needle: string,
  sourceLine: number | null | undefined,
): number {
  const matches: number[] = [];
  let from = 0;
  while (from < content.length) {
    const idx = content.indexOf(needle, from);
    if (idx === -1) break;
    matches.push(idx);
    from = idx + Math.max(needle.length, 1);
  }
  if (matches.length === 0) return -1;
  if (matches.length === 1) return matches[0]!;
  if (typeof sourceLine !== "number" || sourceLine < 1) return -1;
  let best = matches[0]!;
  let bestDist = Infinity;
  for (const idx of matches) {
    const atLine = content.slice(0, idx).split("\n").length;
    const dist = Math.abs(atLine - sourceLine);
    if (dist < bestDist) {
      bestDist = dist;
      best = idx;
    }
  }
  return best;
}

/**
 * When the live DOM class string is empty or no longer matches source
 * (Tailwind merge, extra runtime classes), find a unique text node and
 * write className onto its opening tag.
 */
function injectClassOnUniqueElement(
  files: ProjectFile[],
  selection: VisualEditSelection,
  classes: string,
): { path: string; content: string } | null {
  const text = selection.textContent.trim();
  const tag = selection.tagName.trim().toLowerCase();
  if (!classes.trim() || !tag || !/^[a-z][a-z0-9]*$/.test(tag) || !text || text.length > 240) {
    return null;
  }
  const needle = `>${text}<`;
  const file = uniqueFileContaining(files, needle);
  if (file) {
    const content = file.content as string;
    const textIdx = content.indexOf(needle);
    return rewriteClassOnTagBefore(file.path, content, textIdx, tag, classes);
  }
  for (const f of files) {
    const content = f.content as string;
    const textIdx = occurrenceIndexNearLine(content, needle, selection.sourceLine);
    if (textIdx < 0) continue;
    return rewriteClassOnTagBefore(f.path, content, textIdx, tag, classes);
  }
  return null;
}

function rewriteClassOnTagBefore(
  path: string,
  content: string,
  textIdx: number,
  tag: string,
  classes: string,
): { path: string; content: string } | null {
  if (textIdx < 0) return null;
  const before = content.slice(0, textIdx);
  const openNeedle = `<${tag}`;
  const openIdx = before.toLowerCase().lastIndexOf(openNeedle);
  if (openIdx < 0) return null;
  const gt = content.indexOf(">", openIdx);
  if (gt < 0 || gt > textIdx) return null;
  const openTag = content.slice(openIdx, gt);
  if (openTag.includes("</")) return null;

  const attr = /\.[jt]sx$/.test(path) || openTag.includes("className") ? "className" : "class";
  const escaped = classes.replace(/"/g, "'");
  let nextOpen: string;
  if (/className\s*=/.test(openTag) || /\bclass\s*=/.test(openTag)) {
    nextOpen = openTag.replace(
      /(?:className|class)\s*=\s*(["'])[^"']*\1/,
      `${attr}="${escaped}"`,
    );
  } else {
    const afterName = openIdx + 1 + tag.length;
    nextOpen = `${content.slice(openIdx, afterName)} ${attr}="${escaped}"${content.slice(afterName, gt)}`;
  }
  return {
    path,
    content: content.slice(0, openIdx) + nextOpen + content.slice(gt),
  };
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

// Common inline elements that the visual-edit picker can select — width/
// height utilities are a documented no-op on `display: inline`, so dragging
// a resize handle on a bare <span> would silently do nothing.
const INLINE_TAGS = new Set([
  "span", "a", "em", "strong", "label", "small", "i", "b", "code", "abbr", "cite", "mark", "sub", "sup", "u", "time",
]);
const DISPLAY_UTILITIES = new Set([
  "block", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "table", "table-cell", "hidden",
]);

/**
 * When `tagName` is a common inline element and its classes don't already
 * set a display utility, add `inline-block` so a width/height utility about
 * to be applied (see applyDimensionToken) actually takes effect instead of
 * being silently ignored by the browser.
 */
export function ensureResizableDisplay(classes: string, tagName: string): string {
  if (!INLINE_TAGS.has(tagName.toLowerCase())) return classes;
  const tokens = classes.split(/\s+/).filter(Boolean);
  if (tokens.some((t) => DISPLAY_UTILITIES.has(t))) return classes;
  tokens.push("inline-block");
  return tokens.join(" ");
}

// The 12-swatch palettes the overlay's color tab offers (TAILWIND_COLORS /
// BG_COLORS in visual-edit-overlay.tsx), mapped to the hex value each
// swatch actually renders, so the arbitrary-color picker can show the
// element's real current color instead of defaulting to black when a named
// swatch (not yet an arbitrary hex) is what's applied.
const NAMED_COLOR_HEX: Record<string, string> = {
  "text-white": "#ffffff", "text-black": "#000000", "text-gray-500": "#6b7280",
  "text-red-500": "#ef4444", "text-blue-500": "#3b82f6", "text-green-500": "#22c55e",
  "text-yellow-500": "#eab308", "text-purple-500": "#a855f7", "text-pink-500": "#ec4899",
  "text-indigo-500": "#6366f1", "text-orange-500": "#f97316", "text-teal-500": "#14b8a6",
  "bg-white": "#ffffff", "bg-black": "#000000", "bg-gray-100": "#f3f4f6",
  "bg-blue-500": "#3b82f6", "bg-green-500": "#22c55e", "bg-red-500": "#ef4444",
  "bg-yellow-500": "#eab308", "bg-purple-500": "#a855f7", "bg-indigo-500": "#6366f1",
  "bg-pink-500": "#ec4899",
};

/**
 * Resolve the hex value a color-picker swatch should show for `kind`: an
 * already-applied arbitrary hex utility wins, then a matching named swatch
 * from the fixed palette, else null (the two "no readable color" cases —
 * bg-transparent and bg-gradient-brand aren't single solid colors — also
 * return null so the caller's neutral default applies rather than a wrong
 * guess).
 */
export function resolveDisplayHex(classes: string, kind: "text" | "bg"): string | null {
  const tokens = classes.split(/\s+/).filter(Boolean);
  const arbitraryPrefix = `${kind}-[`;
  const arbitrary = tokens.find((t) => t.startsWith(arbitraryPrefix) && t.endsWith("]"));
  if (arbitrary) {
    const inner = arbitrary.slice(arbitraryPrefix.length, -1);
    if (/^#[0-9a-fA-F]{6}$/.test(inner)) return inner;
    if (/^#[0-9a-fA-F]{3}$/.test(inner)) {
      const [, r, g, b] = inner;
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return null;
  }
  const namedPrefix = `${kind}-`;
  for (const t of tokens) {
    if (!t.startsWith(namedPrefix)) continue;
    const hex = NAMED_COLOR_HEX[t];
    if (hex) return hex;
  }
  return null;
}
