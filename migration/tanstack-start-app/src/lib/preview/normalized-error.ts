import type { PreviewErrorKind, PreviewErrorReport, PreviewRuntimeError } from "./preview-error-bridge.ts";

export type PreviewRuntimeEngine = "static" | "framework";

export interface NormalizedPreviewError extends PreviewRuntimeError {
  engine: PreviewRuntimeEngine;
}

export function normalizePreviewError(
  engine: PreviewRuntimeEngine,
  error: string | Error | PreviewRuntimeError,
  kind: PreviewErrorKind = "runtime",
): NormalizedPreviewError {
  if (typeof error === "object" && "kind" in error && "timestamp" in error) {
    return { ...error, engine };
  }
  return {
    engine,
    kind,
    message: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: Date.now(),
  };
}

export function normalizedErrorReport(error: NormalizedPreviewError): PreviewErrorReport {
  return {
    errors: [error],
    formatted: `1. [${error.kind}] ${error.message}`,
    hasFatal: error.kind !== "console",
  };
}
