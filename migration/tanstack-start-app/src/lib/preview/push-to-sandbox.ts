/**
 * Push freshly saved project files into the RUNNING preview sandbox.
 *
 * WHY. The preview container gets its files exactly twice: a full upload when
 * it is created, and whenever the EDITOR CLIENT chooses to call
 * `sandbox-preview/sync`. Every other writer bypassed the container entirely:
 * the agent build path, the self-repair pass, and direct calls to the files
 * API all saved to the database and stopped there. The result, observed live,
 * was a preview that kept serving a file the database no longer contained —
 * a syntax error stayed on screen for twenty minutes after it was fixed, and
 * the editor showed a stale error banner for code that no longer existed. The
 * only thing that unstuck it was destroying the container.
 *
 * Syncing belongs on the WRITE, not on the client: every save that goes
 * through project-files lands here, so no writer can forget. Fire-and-forget
 * by design — a save must never fail or slow down because the sandbox is
 * cold, mid-install, or gone; the next full boot uploads everything anyway.
 */
import { getSandboxProvider, isSandboxEnabled } from "@/lib/sandbox";

/** Writes are deduped per project so a burst of agent saves coalesces. */
const pending = new Map<string, Map<string, string>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function pushFileToRunningSandbox(
  supabase: unknown,
  projectId: string,
  path: string,
  content: string,
): void {
  try {
    if (!isSandboxEnabled()) return;
    if (!path || path.startsWith(".")) return;

    const batch = pending.get(projectId) ?? new Map<string, string>();
    batch.set(path.replace(/\\/g, "/"), content);
    pending.set(projectId, batch);

    // Small debounce: the agent saves files one PATCH at a time, and pushing a
    // 20-file build as 20 tar uploads restarts vite's watcher 20 times.
    const prev = timers.get(projectId);
    if (prev) clearTimeout(prev);
    timers.set(
      projectId,
      setTimeout(() => {
        timers.delete(projectId);
        const files = pending.get(projectId);
        pending.delete(projectId);
        if (!files || files.size === 0) return;
        void flush(supabase, projectId, files).catch(() => {});
      }, 1200),
    );
  } catch {
    /* never let preview sync break a save */
  }
}

async function flush(
  supabase: unknown,
  projectId: string,
  files: Map<string, string>,
): Promise<void> {
  const sb = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { metadata?: Record<string, unknown> } | null }> };
      };
    };
  };
  const { data } = await sb
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .maybeSingle();
  const meta = (data?.metadata ?? {}) as { sandbox_id?: string | null };
  const sandboxId = typeof meta.sandbox_id === "string" ? meta.sandbox_id : "";
  if (!sandboxId) return; // no live sandbox — the next boot uploads everything

  const provider = getSandboxProvider();
  // The Docker provider content-hashes against its in-container manifest, so
  // re-pushing an unchanged file is a no-op and this stays cheap.
  await provider.writeFiles(
    sandboxId,
    [...files.entries()].map(([path, content]) => ({ path, content })),
  );
}
