
/**
 * CollabCursors
 *
 * Renders remote collaborator cursors and name-tags directly inside a Monaco
 * editor instance using its decorations API. The decoration/clamping rules
 * live in lib/editor/collab-cursor-decorations (unit-tested); this component
 * only applies them to the live editor and injects the per-peer styles.
 */

import { useEffect,useRef } from "react";
import type * as Monaco from "monaco-editor";
import type { Collaborator } from "@/hooks/use-yjs-editor";
import { buildCollabDecorations } from "@/lib/editor/collab-cursor-decorations";

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

    const { decorations, styles } = buildCollabDecorations(collaborators, currentFile, model);

    for (const style of styles) {
      injectCursorStyle(style.styleId, style.color, style.initials);
      if (style.withSelection) injectSelectionStyle(style.styleId, style.color);
    }

    // Swap decorations atomically
    decorationIds.current = model.deltaDecorations(
      decorationIds.current,
      decorations as Monaco.editor.IModelDeltaDecoration[],
    );
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
