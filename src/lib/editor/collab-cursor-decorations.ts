/**
 * Pure decoration-building logic for CollabCursors.
 *
 * Extracted from components/editor/collab-cursors.tsx so the clamping and
 * filtering rules are unit-testable without Monaco or the DOM. The component
 * feeds the result to `model.deltaDecorations` and injects one <style> tag
 * per returned style spec.
 */

import type { Collaborator } from "@/hooks/use-yjs-editor";

/** Structural subset of Monaco's ITextModel that the builder needs. */
export interface CursorModelLike {
  getLineCount(): number;
  getLineLength(lineNumber: number): number;
}

export interface DecorationRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface CollabDecoration {
  range: DecorationRange;
  options: {
    className: string;
    beforeContentClassName?: string;
    /** 1 = NeverGrowsWhenTypingAtEdges */
    stickiness: 1;
  };
}

export interface CursorStyleSpec {
  styleId: string;
  color: string;
  initials: string;
  withSelection: boolean;
}

/** Sanitize a collaborator key into a CSS-safe style id. */
export function styleIdForKey(key: string): string {
  return `cursor-${key.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

export function initialsForName(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

/**
 * Build cursor + selection decorations for every collaborator whose cursor is
 * on `currentFile`, clamped to valid positions in the model.
 */
export function buildCollabDecorations(
  collaborators: Collaborator[],
  currentFile: string,
  model: CursorModelLike,
): { decorations: CollabDecoration[]; styles: CursorStyleSpec[] } {
  const decorations: CollabDecoration[] = [];
  const styles: CursorStyleSpec[] = [];
  const lineCount = model.getLineCount();

  for (const collab of collaborators) {
    if (!collab.cursor || collab.cursor.file !== currentFile) continue;

    const { line, column, selection } = collab.cursor;
    const styleId = styleIdForKey(collab.key);

    const clampedLine = Math.max(1, Math.min(line, lineCount));
    const lineLen = model.getLineLength(clampedLine);
    const clampedColumn = Math.max(1, Math.min(column, lineLen + 1));

    decorations.push({
      range: {
        startLineNumber: clampedLine,
        startColumn: clampedColumn,
        endLineNumber: clampedLine,
        endColumn: clampedColumn,
      },
      options: {
        className: `collab-cursor-${styleId}`,
        beforeContentClassName: `collab-cursor-head-${styleId}`,
        stickiness: 1,
      },
    });

    let withSelection = false;
    if (
      selection &&
      !(
        selection.startLine === selection.endLine &&
        selection.startColumn === selection.endColumn
      )
    ) {
      withSelection = true;
      const startLine = Math.max(1, Math.min(selection.startLine, lineCount));
      const endLine = Math.max(1, Math.min(selection.endLine, lineCount));
      const startColumn = Math.max(1, Math.min(selection.startColumn, model.getLineLength(startLine) + 1));
      const endColumn = Math.max(1, Math.min(selection.endColumn, model.getLineLength(endLine) + 1));
      decorations.push({
        range: { startLineNumber: startLine, startColumn, endLineNumber: endLine, endColumn },
        options: { className: `collab-selection-${styleId}`, stickiness: 1 },
      });
    }

    styles.push({
      styleId,
      color: collab.user.color,
      initials: initialsForName(collab.user.name),
      withSelection,
    });
  }

  return { decorations, styles };
}
