// @ts-nocheck
/**
 * Daily cron — terminate stale Modal/E2B sandboxes (orphaned after editor closes).
 * Lovable keeps warm sandboxes with idle timeout; this cleans DB rows pointing at dead VMs.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/server";
import { getSandboxProvider } from "@/lib/sandbox";


const STALE_HOURS = Number(process.env.SANDBOX_STALE_HOURS ?? 12);

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

  const { data: rows, error } = await (supabase as any)
    .from("projects")
    .select("id, metadata")
    .not("metadata->>sandbox_id", "is", null)
    .lt("metadata->>sandbox_updated_at", cutoff)
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let killed = 0;
  for (const row of rows ?? []) {
    const meta = (row.metadata && typeof row.metadata === "object")
      ? (row.metadata as Record<string, unknown>)
      : {};
    const sandboxId = typeof meta.sandbox_id === "string" ? meta.sandbox_id : null;
    if (!sandboxId) continue;
    try {
      await provider.kill(sandboxId);
      killed += 1;
      await (supabase as any)
        .from("projects")
        .update({
          preview_url: null,
          metadata: { ...meta, sandbox_id: null, sandbox_cleaned_at: new Date().toISOString() },
        })
        .eq("id", row.id);
    } catch {
      /* best-effort */
    }
  }

  return Response.json({ ok: true, scanned: rows?.length ?? 0, killed });
}


export const Route = createFileRoute("/api/cron/sandbox-cleanup")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGET(request),
    },
  },
});
