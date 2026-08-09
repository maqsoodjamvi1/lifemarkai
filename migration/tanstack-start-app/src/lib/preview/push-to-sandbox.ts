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
import { getSandboxProvider,isSandboxEnabled } from "@/lib/sandbox";
import { ensureViteTunnelHmr } from "./patch-sandbox-preview-files.ts";
import { repairImportsInFile } from "./normalize-imports.ts";

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

interface MinimalSupabase {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (key: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { metadata?: Record<string, unknown> } | null;
        }>;
        limit: (n: number) => Promise<{ data: Array<{ path: string }> | null }>;
      };
    };
  };
}

/**
 * Every path the project currently has, so a mid-build push can tell a broken
 * import from one that merely points outside this batch. Paths only — contents
 * are not needed to resolve a specifier, and pulling them for a 200-file
 * project on every debounced save would be wasteful.
 */
async function projectFilePaths(sb: MinimalSupabase, projectId: string): Promise<string[]> {
  try {
    const { data } = await sb
      .from("project_files")
      .select("path")
      .eq("project_id", projectId)
      .limit(5000);
    return (data ?? []).map((r) => r.path).filter(Boolean);
  } catch {
    return []; // repair is best-effort; the push itself must still happen
  }
}

async function flush(
  supabase: unknown,
  projectId: string,
  files: Map<string, string>,
): Promise<void> {
  const sb = supabase as MinimalSupabase;
  const { data } = await sb
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .maybeSingle();
  const meta = (data?.metadata ?? {}) as { sandbox_id?: string | null };
  const sandboxId = typeof meta.sandbox_id === "string" ? meta.sandbox_id : "";
  if (!sandboxId) return; // no live sandbox — the next boot uploads everything

  const provider = getSandboxProvider();

  // Files uploaded at CONTAINER CREATION go through patchSandboxPreviewFiles;
  // files pushed here mid-session were going in raw, and that asymmetry had
  // teeth. A build wrote its own `vite.config.ts` with no `server` block, this
  // sync replaced the patched scaffold copy with it, and the preview died with
  //
  //     Blocked request. This host (…preview.lifemarkai.com) is not allowed.
  //
  // — a perfectly good 45-file ERP rendering one line of black text. Any
  // file-local sandbox transform must therefore run on this path too.
  //
  // Only file-LOCAL transforms belong here: the set-level ones (synthesising a
  // missing entry, injecting Supabase env, adding tailwind plugin deps) need
  // the whole project and a fresh `npm install`, which only happens on boot.
  //
  // Import repair is the exception that has to be given its context back. A
  // build streams files one at a time, so the WORST moment for a bad specifier
  // is right here — `src/components/ui/tooltip.tsx` arriving with
  // `import { cn } from "../utils.ts"` freezes the preview mid-build with
  // "Failed to resolve import". Resolving it needs the project's path list, so
  // we fetch that (paths only) rather than skip the repair on this path and
  // let the auto-fix loop pay a model call for a mechanical mistake.
  const batch = [...files.entries()].map(([path, content]) => ({ path, content }));
  const known = new Set<string>(batch.map((f) => f.path));
  for (const p of await projectFilePaths(sb, projectId)) known.add(p.replace(/\\/g, "/"));

  const repaired = batch.map((f) => ({
    path: f.path,
    content: repairImportsInFile(f.path, f.content, known),
  }));

  const patched = ensureViteTunnelHmr(repaired);

  // The Docker provider content-hashes against its in-container manifest, so
  // re-pushing an unchanged file is a no-op and this stays cheap.
  await provider.writeFiles(sandboxId, patched);
}
