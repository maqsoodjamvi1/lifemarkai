import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  computePatches,
  reconstructFromChain,
  filesSize,
  patchesSize,
  shouldStoreBaseline,
  type SnapshotFile,
  type FilePatch,
  type SnapshotChainEntry,
} from "@/lib/diff/snapshot-diff";

// ── GET — list snapshots OR reconstruct a specific snapshot's files ────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId  = req.nextUrl.searchParams.get("projectId");
  const snapshotId = req.nextUrl.searchParams.get("id");

  // ── Reconstruct a specific snapshot's full file list ────────────────────────
  if (snapshotId) {
    // Verify user owns the target snapshot
    const { data: snap } = await (supabase as any)
      .from("project_snapshots")
      .select("id, user_id")
      .eq("id", snapshotId)
      .single();
    if (!snap || snap.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Walk the ancestor chain (SQL recursive walk, returned oldest-first)
    const { data: chain, error } = await (supabase as any)
      .rpc("get_snapshot_chain", { p_snapshot_id: snapshotId });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const entries = (chain ?? []) as SnapshotChainEntry[];
    const files   = reconstructFromChain(entries);
    return NextResponse.json({ files });
  }

  // ── List snapshots for a project ─────────────────────────────────────────────
  if (!projectId) return NextResponse.json({ error: "projectId or id required" }, { status: 400 });

  const { data } = await (supabase as any)
    .from("project_snapshots")
    .select("id, label, is_baseline, is_pinned, pinned_at, created_at, screenshot_url")
    .eq("project_id", projectId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json(data ?? []);
}

// ── PATCH — toggle pin / unpin a snapshot ──────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { snapshotId, isPinned } = await req.json() as {
    snapshotId: string;
    isPinned: boolean;
  };
  if (!snapshotId) {
    return NextResponse.json({ error: "snapshotId required" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("project_snapshots")
    .update({
      is_pinned: !!isPinned,
      pinned_at: isPinned ? new Date().toISOString() : null,
    })
    .eq("id", snapshotId)
    .eq("user_id", user.id)
    .select("id, is_pinned, pinned_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ── POST — create snapshot (baseline or delta, whichever is smaller) ──────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, label } = await req.json() as { projectId: string; label?: string };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // Verify ownership and grab current preview_url for the screenshot thumbnail
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, preview_url")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const screenshotUrl: string | null = (project as { preview_url?: string | null }).preview_url ?? null;

  // Fetch current files
  const { data: currentFiles } = await (supabase as any)
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", projectId);

  if (!currentFiles || currentFiles.length === 0) {
    return NextResponse.json({ error: "No files to snapshot" }, { status: 400 });
  }

  const snapshotLabel = label ?? `Snapshot ${new Date().toLocaleString()}`;

  // Find the latest existing snapshot for this project.
  // maybeSingle (not single): a project's first snapshot has zero prior rows,
  // and .single() raises PGRST116 on an empty result — a spurious error here.
  const { data: latest } = await (supabase as any)
    .from("project_snapshots")
    .select("id, is_baseline, files, patches")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let insertPayload: Record<string, unknown>;

  if (!latest) {
    // ── No previous snapshot — store baseline ─────────────────────────────────
    insertPayload = {
      project_id:    projectId,
      user_id:       user.id,
      label:         snapshotLabel,
      is_baseline:   true,
      files:         currentFiles,
      patches:       null,
      parent_id:     null,
      screenshot_url: screenshotUrl,
    };
  } else {
    // ── Reconstruct previous state and compute delta ──────────────────────────
    let previousFiles: SnapshotFile[];

    if (latest.is_baseline) {
      previousFiles = (latest.files ?? []) as SnapshotFile[];
    } else {
      // Reconstruct from chain to get previous state
      const { data: chain } = await (supabase as any)
        .rpc("get_snapshot_chain", { p_snapshot_id: latest.id });
      previousFiles = reconstructFromChain((chain ?? []) as SnapshotChainEntry[]);
    }

    const patches      = computePatches(previousFiles, currentFiles as SnapshotFile[]);
    const chainDepth   = await getChainDepth(supabase, latest.id);
    const forceBase    = shouldStoreBaseline({
      hasPrevious:  true,
      chainDepth,
      patchBytes:   patchesSize(patches),
      fullBytes:    filesSize(currentFiles as SnapshotFile[]),
    });

    if (forceBase || patches.length === 0) {
      // Store full baseline (either forced or nothing changed but user explicitly snapshotted)
      insertPayload = {
        project_id:    projectId,
        user_id:       user.id,
        label:         snapshotLabel,
        is_baseline:   true,
        files:         currentFiles,
        patches:       null,
        parent_id:     null,
        screenshot_url: screenshotUrl,
      };
    } else {
      // Store lightweight delta
      insertPayload = {
        project_id:    projectId,
        user_id:       user.id,
        label:         snapshotLabel,
        is_baseline:   false,
        files:         null,
        patches:       patches,
        parent_id:     latest.id,
        screenshot_url: screenshotUrl,
      };
    }
  }

  const { data: snapshot, error } = await (supabase as any)
    .from("project_snapshots")
    .insert(insertPayload)
    .select("id, label, is_baseline, created_at, screenshot_url")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const changedCount = insertPayload.is_baseline
    ? (currentFiles.length)
    : ((insertPayload.patches as FilePatch[]).length);

  return NextResponse.json(
    { ...snapshot, changedFiles: changedCount, isDelta: !insertPayload.is_baseline },
    { status: 201 }
  );
}

// ── DELETE — remove a snapshot ────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snapshotId = req.nextUrl.searchParams.get("id");
  if (!snapshotId) return NextResponse.json({ error: "id required" }, { status: 400 });

  await (supabase as any)
    .from("project_snapshots")
    .delete()
    .eq("id", snapshotId)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getChainDepth(supabase: any, latestId: string): Promise<number> {
  const { data } = await (supabase as any)
    .rpc("count_delta_chain", { p_snapshot_id: latestId });
  return (data as number) ?? 0;
}
