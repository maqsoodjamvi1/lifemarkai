// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/cloud/daily-backups
 * Header: x-cron-secret: $CRON_SECRET
 *
 * Scheduled endpoint (call from a nightly cron / GH action / Vercel cron).
 * For every project with cloud_enabled=true that hasn't been backed up today,
 * creates a baseline snapshot and records it in lifemark_cloud_auto_backups.
 *
 * Also enforces ~14-day retention by deleting older auto-backup records and
 * their underlying snapshots.
 */

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const RETENTION_DAYS = 14;

export async function POST(req: NextRequest) {
  // Auth: cron secret or Vercel cron auto-header
  const provided = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createAdminClient();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // 1) Find projects that need a backup today
  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id, name")
    .eq("cloud_enabled", true)
    .eq("cloud_status", "active");
  if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 });

  const results: Array<{ project: string; status: string; note?: string }> = [];

  for (const project of (projects ?? [])) {
    // Skip if already backed up today
    const { data: existing } = await supabase
      .from("lifemark_cloud_auto_backups")
      .select("id")
      .eq("project_id", project.id)
      .eq("run_date", today)
      .maybeSingle();
    if (existing) {
      results.push({ project: project.name, status: "skipped", note: "already-backed-up-today" });
      continue;
    }

    // Grab current files for baseline snapshot
    const { data: files } = await supabase
      .from("project_files")
      .select("path, content, language")
      .eq("project_id", project.id);

    if (!files || files.length === 0) {
      await supabase.from("lifemark_cloud_auto_backups").insert({
        project_id: project.id,
        run_date: today,
        status: "skipped",
        notes: "no files",
      });
      results.push({ project: project.name, status: "skipped", note: "no-files" });
      continue;
    }

    // Insert baseline snapshot
    const { data: snap, error: snapErr } = await supabase
      .from("project_snapshots")
      .insert({
        project_id: project.id,
        user_id: project.user_id,
        label: `Auto-backup ${today}`,
        is_baseline: true,
        files,
        patches: null,
        parent_id: null,
      })
      .select("id")
      .single();

    if (snapErr || !snap) {
      await supabase.from("lifemark_cloud_auto_backups").insert({
        project_id: project.id,
        run_date: today,
        status: "failed",
        notes: snapErr?.message ?? "snapshot insert failed",
      });
      results.push({ project: project.name, status: "failed", note: snapErr?.message });
      continue;
    }

    await supabase.from("lifemark_cloud_auto_backups").insert({
      project_id: project.id,
      snapshot_id: snap.id,
      run_date: today,
      status: "ok",
    });
    results.push({ project: project.name, status: "ok" });
  }

  // 2) Enforce retention — delete auto-backup snapshots older than RETENTION_DAYS
  const retentionDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const { data: oldBackups } = await supabase
    .from("lifemark_cloud_auto_backups")
    .select("id, snapshot_id")
    .lt("run_date", retentionDate);

  let purged = 0;
  for (const ob of (oldBackups ?? [])) {
    if (ob.snapshot_id) {
      await supabase.from("project_snapshots").delete().eq("id", ob.snapshot_id);
    }
    await supabase.from("lifemark_cloud_auto_backups").delete().eq("id", ob.id);
    purged++;
  }

  return NextResponse.json({
    ok: true,
    date: today,
    processed: results.length,
    results,
    purged,
  });
}
