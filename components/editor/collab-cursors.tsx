"use client";

/**
 * CollabCursors
 *
 * Renders remote collaborator cursors and name-tags directly inside a Monaco
 * editor instance using its decorations API.
 *
 * Props:
 *   editor       — the Monaco editor instance
 *   collaborators — list of remote peers with cursor positions
 *   currentFile  — path of the currently open file (cursors for other files
 *                  are hidden)
 */

import { useEffect, useRef } from "react";
import type * as Monaco from "monaco-editor";
import type { Collaborator } from "@/hooks/use-yjs-editor";

interface CollabCursorsProps {
  editor: Monaco.editor.IStandaloneCodeEditor | null;
  collaborators: Collaborator[];
  currentFile: string;
}

export function CollabCursors({ editor, collaborators, currentFile }: CollabCursorsProps) {
  const decorationIds = useRef<string[]>([]);

  useEffect(() => {
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    // Build new decorations for peers that are on this file
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

    for (const collab of collaborators) {
      if (!collab.cursor || collab.cursor.file !== currentFile) continue;

      const { line, column, selection } = collab.cursor;
      const color = collab.user.color;
      const name  = collab.user.name;
      const initials = name.slice(0, 2).toUpperCase();

      // Clamp to valid model bounds
      const lineCount = model.getLineCount();
      const clampedLine   = Math.max(1, Math.min(line, lineCount));
      const lineLen       = model.getLineLength(clampedLine);
      const clampedColumn = Math.max(1, Math.min(column, lineLen + 1));

      // ── Cursor line decoration (thin coloured bar) ─────────────────────
      const styleId = `cursor-${collab.key.replace(/[^a-zA-Z0-9]/g, "_")}`;
      injectCursorStyle(styleId, color, initials);

      decorations.push({
        range: {
          startLineNumber: clampedLine,
          startColumn:     clampedColumn,
          endLineNumber:   clampedLine,
          endColumn:       clampedColumn,
        },
        options: {
          className:       `collab-cursor-${styleId}`,
          beforeContentClassName: `collab-cursor-head-${styleId}`,
          stickiness: 1, // NeverGrowsWhenTypingAtEdges
        },
      });

      // ── Selection highlight ────────────────────────────────────────────
      if (
        selection &&
        !(
          selection.startLine === selection.endLine &&
          selection.startColumn === selection.endColumn
        )
      ) {
        const startLine   = Math.max(1, Math.min(selection.startLine, lineCount));
        const endLine     = Math.max(1, Math.min(selection.endLine, lineCount));
        const startColumn = Math.max(1, Math.min(selection.startColumn, model.getLineLength(startLine) + 1));
        const endColumn   = Math.max(1, Math.min(selection.endColumn, model.getLineLength(endLine) + 1));

        decorations.push({
          range: { startLineNumber: startLine, startColumn, endLineNumber: endLine, endColumn },
          options: {
            className: `collab-selection-${styleId}`,
            stickiness: 1,
          },
        });
        injectSelectionStyle(styleId, color);
      }
    }

    // Swap decorations atomically
    decorationIds.current = model.deltaDecorations(decorationIds.current, decorations);
  }, [editor, collaborators, currentFile]);

  // Clear decorations when unmounted
  useEffect(() => {
    return () => {
      const model = editor?.getModel();
      if (model && decorationIds.current.length > 0) {
        model.deltaDecorations(decorationIds.current, []);
        decorationIds.current = [];
      }
    };
  }, [editor]);

  return null; // purely side-effectful
}

// ── Style injection helpers ───────────────────────────────────────────────────
// Inject <style> tags at most once per cursor ID to avoid thrashing the DOM.

const injectedStyles = new Set<string>();

function injectCursorStyle(styleId: string, color: string, initials: string) {
  const cursorKey = `cursor-${styleId}`;
  if (injectedStyles.has(cursorKey)) return;
  injectedStyles.add(cursorKey);

  const css = `
.collab-cursor-${styleId} {
  border-left: 2px solid ${color};
  margin-left: -1px;
  position: relative;
}
.collab-cursor-head-${styleId}::before {
  content: '${initials}';
  position: absolute;
  top: -18px;
  left: -1px;
  background: ${color};
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  font-family: system-ui, sans-serif;
  padding: 1px 4px;
  border-radius: 3px 3px 3px 0;
  white-space: nowrap;
  z-index: 100;
  pointer-events: none;
  line-height: 16px;
}`;

  const el = document.createElement("style");
  el.textContent = css;
  document.head.appendChild(el);
}

function injectSelectionStyle(styleId: string, color: string) {
  const selKey = `sel-${styleId}`;
  if (injectedStyles.has(selKey)) return;
  injectedStyles.add(selKey);

  const css = `
.collab-selection-${styleId} {
  background: ${color}33;
}`;

  const el = document.createElement("style");
  el.textContent = css;
  document.head.appendChild(el);
}
