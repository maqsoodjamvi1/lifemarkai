import type { SandboxRunResult } from "../sandbox/index.ts";

const pending = new Map<string, Promise<SandboxRunResult | null>>();

/** Coalesce simultaneous editor polls without caching a failed readiness check. */
export function probeStartingSandbox(
  sandboxId: string,
  reconnect: (id: string) => Promise<SandboxRunResult>,
): Promise<SandboxRunResult | null> {
  const existing = pending.get(sandboxId);
  if (existing) return existing;
  const probe = Promise.resolve().then(() => reconnect(sandboxId))
    .then((result) => result.ok && result.ready === true && result.previewUrl
      && (!result.sandboxId || result.sandboxId === sandboxId) ? result : null)
    .catch(() => null)
    .finally(() => pending.delete(sandboxId));
  pending.set(sandboxId, probe);
  return probe;
}
