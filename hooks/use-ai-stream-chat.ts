"use client";

/**
 * Unified hook: native fetch stream consumer + incremental file sync.
 *
 * @example
 * const { consume, fileSync } = useAIStreamChat({
 *   projectId, files, onFilesChange: onFilesUpdate,
 * });
 * await consume(response, { signal, onEvent: handleStatus });
 */

import { useCallback, useMemo } from "react";
import type { ProjectFile } from "@/types/database";
import { handleAIStream, type AIStreamHandlers, type HandleAIStreamResult } from "@/lib/ai/handle-ai-stream";
import type { ParsedFileUpdate } from "@/lib/ai/xml-stream-parser";
import { usePreviewFileSync, type PreviewFileSyncOptions } from "@/hooks/use-preview-file-sync";

export interface UseAIStreamChatOptions extends Omit<PreviewFileSyncOptions, "onFilesChange"> {
  onFilesChange: (files: ProjectFile[]) => void;
  /** Apply XML file updates during stream (default true for build/agent/patch) */
  applyFileUpdates?: boolean;
}

export interface ConsumeStreamOptions {
  signal?: AbortSignal;
  handlers?: Omit<AIStreamHandlers, "onFileUpdate">;
  /** Called for each parsed <file_update> before apply */
  onFileUpdate?: (update: ParsedFileUpdate) => void;
}

export function useAIStreamChat(options: UseAIStreamChatOptions) {
  const { applyFileUpdates = true, onFilesChange, ...syncOpts } = options;

  const fileSync = usePreviewFileSync({
    ...syncOpts,
    onFilesChange,
  });

  const consume = useCallback(
    async (response: Response, opts?: ConsumeStreamOptions): Promise<HandleAIStreamResult> => {
      const handlers: AIStreamHandlers = {
        ...opts?.handlers,
        onFileUpdate: applyFileUpdates
          ? async (update) => {
              opts?.onFileUpdate?.(update);
              fileSync.apply(update);
            }
          : opts?.onFileUpdate,
        onDone: (summary) => {
          fileSync.flush();
          opts?.handlers?.onDone?.(summary);
        },
      };

      return handleAIStream(response, {
        signal: opts?.signal,
        format: "sse",
        handlers,
      });
    },
    [applyFileUpdates, fileSync],
  );

  return useMemo(
    () => ({ consume, fileSync, flush: fileSync.flush }),
    [consume, fileSync],
  );
}
