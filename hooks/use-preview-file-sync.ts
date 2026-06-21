"use client";

/**
 * Bridges streaming AI file updates → Sandpack / WebContainer file state.
 *
 * - Applies <full> and <search>/<replace> patches safely
 * - Debounces rapid-fire stream updates
 * - Optional persistence hook (PATCH /api/projects/…/files)
 */

import { useCallback, useRef, useState } from "react";
import type { ProjectFile } from "@/types/database";
import {
  applySearchReplace,
  type ParsedFileUpdate,
} from "@/lib/ai/xml-stream-parser";
import { detectLanguage } from "@/lib/ai/code-parser";

export interface PreviewFileSyncOptions {
  projectId: string;
  files: ProjectFile[];
  onFilesChange: (next: ProjectFile[]) => void;
  /** Debounce ms before committing batched updates (default 80) */
  debounceMs?: number;
  /** Persist each committed file to the API */
  persist?: boolean;
  onPersistError?: (path: string, error: Error) => void;
}

export interface PreviewFileSyncApi {
  files: ProjectFile[];
  pendingPaths: string[];
  apply: (update: ParsedFileUpdate) => void;
  flush: () => void;
  lastError: string | null;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\//, "");
}

function applyUpdateToFiles(
  files: ProjectFile[],
  update: ParsedFileUpdate,
  projectId: string,
): { next: ProjectFile[]; error: string | null } {
  const path = normalizePath(update.path);
  const existing = files.find((f) => f.path === path);

  if (update.kind === "full") {
    const content = update.content ?? "";
    if (existing) {
      return {
        next: files.map((f) =>
          f.path === path
            ? { ...f, content, language: update.language ?? f.language }
            : f,
        ),
        error: null,
      };
    }
    const newFile: ProjectFile = {
      id: `stream-${path}-${Date.now()}`,
      project_id: projectId,
      path,
      content,
      language: update.language ?? detectLanguage(path),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return { next: [...files, newFile], error: null };
  }

  if (!existing) {
    return { next: files, error: `Cannot patch missing file: ${path}` };
  }

  const search = update.search ?? "";
  const replace = update.replace ?? "";
  const result = applySearchReplace(existing.content, search, replace);
  if (!result.ok) {
    return { next: files, error: `${path}: ${result.reason}` };
  }

  return {
    next: files.map((f) =>
      f.path === path ? { ...f, content: result.content } : f,
    ),
    error: null,
  };
}

export function usePreviewFileSync(options: PreviewFileSyncOptions): PreviewFileSyncApi {
  const {
    projectId,
    files,
    onFilesChange,
    debounceMs = 80,
    persist = false,
    onPersistError,
  } = options;

  const filesRef = useRef(files);
  filesRef.current = files;

  const pendingRef = useRef<Map<string, ProjectFile>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingPaths, setPendingPaths] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const commit = useCallback(() => {
    if (pendingRef.current.size === 0) return;

    const pending = new Map(pendingRef.current);
    pendingRef.current.clear();
    setPendingPaths([]);

    const merged = filesRef.current.map((f) => {
      const p = pending.get(f.path);
      return p ?? f;
    });
    for (const [path, file] of pending) {
      if (!filesRef.current.some((f) => f.path === path)) {
        merged.push(file);
      }
    }

    filesRef.current = merged;
    onFilesChange(merged);

    if (persist) {
      for (const file of pending.values()) {
        void fetch(`/api/projects/${projectId}/files`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: file.path,
            content: file.content,
            language: file.language,
          }),
        }).catch((e: unknown) => {
          const err = e instanceof Error ? e : new Error(String(e));
          onPersistError?.(file.path, err);
        });
      }
    }
  }, [onFilesChange, onPersistError, persist, projectId]);

  const scheduleCommit = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      commit();
    }, debounceMs);
  }, [commit, debounceMs]);

  const apply = useCallback(
    (update: ParsedFileUpdate) => {
      const { next, error } = applyUpdateToFiles(filesRef.current, update, projectId);
      if (error) {
        setLastError(error);
        return;
      }
      setLastError(null);
      filesRef.current = next;

      const path = normalizePath(update.path);
      const file = next.find((f) => f.path === path);
      if (file) {
        pendingRef.current.set(path, file);
        setPendingPaths(Array.from(pendingRef.current.keys()));
        scheduleCommit();
      }
    },
    [projectId, scheduleCommit],
  );

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    commit();
  }, [commit]);

  return {
    files: filesRef.current,
    pendingPaths,
    apply,
    flush,
    lastError,
  };
}
