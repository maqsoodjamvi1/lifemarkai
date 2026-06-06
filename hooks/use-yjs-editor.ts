"use client";

/**
 * useYjsEditor
 *
 * React hook that wires Yjs + SupabaseYjsProvider into the Monaco editor
 * for a single project file.
 *
 * Usage:
 *   const { bind, collaborators, synced } = useYjsEditor({ projectId, file, user, supabase });
 *   // then pass `bind` to the Monaco onMount callback:
 *   <MonacoEditor onMount={(editor) => bind(editor)} />
 *
 * The hook:
 *   1. Creates a Y.Doc shared across all open tabs for the project
 *   2. Creates/reuses a SupabaseYjsProvider bound to that doc
 *   3. Exposes a `bind(editor)` fn that:
 *      a. Syncs the Monaco text model → Y.Text on first bind
 *      b. Applies Y.Text changes → Monaco model (remote changes)
 *      c. Applies Monaco changes → Y.Text (local changes)
 *      d. Tracks cursor/selection position in awareness
 *   4. Returns `collaborators` (remote peers' awareness states)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type * as Monaco from "monaco-editor";
import {
  SupabaseYjsProvider,
  colorForUserId,
  type AwarenessState,
  type CollabUser,
} from "@/lib/collaboration/supabase-yjs-provider";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface YjsEditorOptions {
  /** Project ID — used as the Realtime room name */
  projectId: string;
  /** File path currently open in the editor */
  filePath: string;
  /** Initial file content (used to seed Y.Text on first open) */
  initialContent: string;
  /** Authenticated user */
  user: { id: string; name: string; avatar?: string };
  supabase: SupabaseClient;
  /** Set to false to skip collaborative binding (e.g. viewer-only) */
  enabled?: boolean;
}

export interface Collaborator {
  key: string;
  user: CollabUser;
  cursor?: AwarenessState["cursor"];
}

export interface YjsEditorResult {
  /** Call this inside Monaco's `onMount` to activate collaboration */
  bind: (editor: Monaco.editor.IStandaloneCodeEditor) => void;
  /** Remote peers currently in this session */
  collaborators: Collaborator[];
  /** Whether the initial Yjs sync has completed */
  synced: boolean;
  /** Destroy the provider manually (called automatically on unmount) */
  destroy: () => void;
}

// ── Module-level singletons (one per project) ─────────────────────────────────
// We keep the Y.Doc and provider alive across file-tab switches so the
// collaborative session isn't interrupted when the user opens a different file.

interface ProjectSession {
  doc: Y.Doc;
  provider: SupabaseYjsProvider;
  refCount: number;
}

const sessions = new Map<string, ProjectSession>();

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useYjsEditor({
  projectId,
  filePath,
  initialContent,
  user,
  supabase,
  enabled = true,
}: YjsEditorOptions): YjsEditorResult {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [synced, setSynced] = useState(false);

  // Stable refs so callbacks don't stale-close
  const editorRef    = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const disposables  = useRef<Array<{ dispose(): void }>>([]);
  const sessionRef   = useRef<ProjectSession | null>(null);
  const filePathRef  = useRef(filePath);
  filePathRef.current = filePath;

  // ── Session lifecycle ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    // Reuse existing session for this project, or create a new one
    let session = sessions.get(projectId);
    if (!session) {
      const doc = new Y.Doc();
      const collabUser: CollabUser = {
        id: user.id,
        name: user.name,
        color: colorForUserId(user.id),
        avatar: user.avatar,
      };
      const provider = new SupabaseYjsProvider(doc, projectId, supabase, collabUser);
      session = { doc, provider, refCount: 0 };
      sessions.set(projectId, session);
    }
    session.refCount++;
    sessionRef.current = session;

    const { provider } = session;

    // Awareness change → update collaborators list
    const onAwarenessChange = (states: Map<string, AwarenessState>) => {
      setCollaborators(
        Array.from(states.entries()).map(([key, s]) => ({
          key,
          user: s.user,
          cursor: s.cursor,
        }))
      );
    };

    const onSynced = () => setSynced(true);

    provider.on("awareness-change", onAwarenessChange);
    provider.on("synced", onSynced);
    if (provider.synced) setSynced(true);

    return () => {
      provider.off("awareness-change", onAwarenessChange as Parameters<typeof provider.off>[1]);
      provider.off("synced", onSynced);

      session!.refCount--;
      if (session!.refCount <= 0) {
        provider.destroy();
        sessions.delete(projectId);
      }
    };
  }, [projectId, enabled, supabase, user.id, user.name, user.avatar]);

  // ── bind(editor) ──────────────────────────────────────────────────────────

  const bind = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor) => {
      if (!enabled || !sessionRef.current) return;

      // Clean up previous editor bindings
      disposables.current.forEach((d) => d.dispose());
      disposables.current = [];

      editorRef.current = editor;
      const { doc, provider } = sessionRef.current;

      // Y.Text key = file path (one Y.Text per file in the shared doc)
      const yText = doc.getText(filePath);

      // ── Seed Y.Text from initialContent if empty ────────────────────────
      if (yText.length === 0 && initialContent) {
        doc.transact(() => { yText.insert(0, initialContent); }, "init");
      }

      // ── Sync Y.Text → Monaco model (once, on bind) ──────────────────────
      const model = editor.getModel();
      if (model) {
        const currentYContent = yText.toString();
        if (currentYContent && currentYContent !== model.getValue()) {
          model.setValue(currentYContent);
        }
      }

      // ── Y.Text changes → Monaco model (remote edits) ────────────────────
      let applyingRemote = false;

      const yObserver = (event: Y.YTextEvent) => {
        if (applyingRemote) return;
        const editorModel = editorRef.current?.getModel();
        if (!editorModel) return;

        applyingRemote = true;
        try {
          // Reconstruct the full new text from Y.Text
          const newText = yText.toString();
          if (editorModel.getValue() !== newText) {
            // Use pushEditOperations to preserve undo stack
            const fullRange = editorModel.getFullModelRange();
            editorModel.pushEditOperations(
              [],
              [{ range: fullRange, text: newText }],
              () => null
            );
          }
        } finally {
          applyingRemote = false;
        }
      };

      yText.observe(yObserver);
      disposables.current.push({ dispose: () => yText.unobserve(yObserver) });

      // ── Monaco model changes → Y.Text (local edits) ──────────────────────
      const contentSub = editor.onDidChangeModelContent((e) => {
        if (applyingRemote) return;

        const editorModel = editor.getModel();
        if (!editorModel) return;

        doc.transact(() => {
          // Apply each change in reverse order so positions don't shift
          const changes = [...e.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
          for (const change of changes) {
            if (change.rangeLength > 0) {
              yText.delete(change.rangeOffset, change.rangeLength);
            }
            if (change.text) {
              yText.insert(change.rangeOffset, change.text);
            }
          }
        }, "local");
      });
      disposables.current.push(contentSub);

      // ── Cursor/selection → awareness ─────────────────────────────────────
      const cursorSub = editor.onDidChangeCursorSelection((e) => {
        const pos = e.selection.getStartPosition();
        provider.setCursor({
          file: filePathRef.current,
          line: pos.lineNumber,
          column: pos.column,
          selection: {
            startLine:   e.selection.startLineNumber,
            startColumn: e.selection.startColumn,
            endLine:     e.selection.endLineNumber,
            endColumn:   e.selection.endColumn,
          },
        });
      });
      disposables.current.push(cursorSub);
    },
    [enabled, filePath, initialContent]
  );

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  const destroy = useCallback(() => {
    disposables.current.forEach((d) => d.dispose());
    disposables.current = [];
    editorRef.current = null;
  }, []);

  useEffect(() => () => { destroy(); }, [destroy]);

  return { bind, collaborators, synced, destroy };
}
