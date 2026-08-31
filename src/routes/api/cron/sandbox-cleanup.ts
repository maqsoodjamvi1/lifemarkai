/**
 * Daily cron — terminate stale Modal/E2B sandboxes (orphaned after editor closes).
 * Lovable keeps warm sandboxes with idle timeout; this cleans DB rows pointing at dead VMs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/server";
import { getSandboxProvider, type SandboxProvider } from "@/lib/sandbox";


const STALE_HOURS = Number(process.env.SANDBOX_STALE_HOURS ?? 12);

// Each stale sandbox costs a real network round trip to kill (a Docker
// container DELETE, a Modal/E2B API call) plus a DB update — awaited one at
// a time, up to 50 rows serialized into worst-case-50x that latency for a
// cron run that has no user waiting on it but does hold a DB connection and
// a function invocation open the whole time. Bounded concurrency gets the
// same work done in ~1/Nth the wall-clock without firing 50 requests at
// once against a provider that may itself rate-limit.
const CLEANUP_CONCURRENCY = 8;

async function killAndCleanRow(
  provider: SandboxProvider,
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  row: { id: string; metadata: unknown },
): Promise<boolean> {
  const meta = (row.metadata && typeof row.metadata === "object")
    ? (row.metadata as Record<string, unknown>)
    : {};
  const sandboxId = typeof meta.sandbox_id === "string" ? meta.sandbox_id : null;
  if (!sandboxId) return false;
  try {
    await provider.kill(sandboxId);
    await supabase
      .from("projects")
      .update({
        preview_url: null,
        metadata: { ...meta, sandbox_id: null, sandbox_cleaned_at: new Date().toISOString() },
      })
      .eq("id", row.id);
    return true;
  } catch {
    /* best-effort */
    return false;
  }
}

async function handleGET(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getSandboxProvider();
  if (!provider.isEnabled()) {
    return Response.json({ ok: true, skipped: true, reason: "sandbox_not_configured" });
  }

  const supabase = await createAdminClient();
  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("projects")
    .select("id, metadata")
    .not("metadata->>sandbox_id", "is", null)
    .lt("metadata->>sandbox_updated_at", cutoff)
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let killed = 0;
  const queue = [...(rows ?? [])];
  async function worker() {
    let row: (typeof queue)[number] | undefined;
    // eslint-disable-next-line no-cond-assign -- draining a shared queue is the point
    while ((row = queue.shift())) {
      if (await killAndCleanRow(provider, supabase, row)) killed += 1;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CLEANUP_CONCURRENCY, queue.length) }, () => worker()),
  );

  return Response.json({ ok: true, scanned: rows?.length ?? 0, killed });
}


export const Route = createFileRoute("/api/cron/sandbox-cleanup")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGET(request),
    },
  },
});
