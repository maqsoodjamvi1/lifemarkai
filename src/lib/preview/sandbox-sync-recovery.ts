/** Errors that require restoring the sandbox before retrying a file write. */
export function needsSandboxSyncRecovery(error: string | undefined): boolean {
  return /already completed|invalid sandbox|not found|not responding|no such sandbox|container.*(?:not running|is stopped|is paused)/i.test(error ?? "");
}
