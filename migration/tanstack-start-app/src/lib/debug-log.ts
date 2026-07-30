/**
 * Session debug logger — appends NDJSON to repo-root debug-32a6e2.log.
 * Prefer this when the local ingest server (127.0.0.1:7580) is unreachable.
 */
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const SESSION = "32a6e2";
const LOG_PATH = join(process.cwd(), "..", "..", "debug-32a6e2.log");

export function debugLog(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}) {
  try {
    const line = JSON.stringify({
      sessionId: SESSION,
      timestamp: Date.now(),
      runId: payload.runId ?? "tanstack-preview",
      hypothesisId: payload.hypothesisId,
      location: payload.location,
      message: payload.message,
      data: payload.data ?? {},
    });
    appendFileSync(LOG_PATH, `${line}\n`);
  } catch {
    /* never break request path for logging */
  }
}
