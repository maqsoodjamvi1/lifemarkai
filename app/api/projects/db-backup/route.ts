/**
 * Database backup / restore API
 *
 * GET    /api/projects/db-backup?projectId=  — list backups
 * POST   /api/projects/db-backup             — create a backup (exports project_files as SQL seed + schema)
 * POST   { action: "restore", projectId, content } — restore files from a SQL dump
 * DELETE /api/projects/db-backup?id=         — delete a backup record
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSqlBackup } from "@/lib/backup/parse-sql-backup";

// ── GET — list backups ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = await createAdminClient();
  const { data } = await (admin as any)
    .from("db_backups")
    .select("id, label, size_bytes, status, created_at, storage_path")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json(data ?? []);
}

// ── POST — create backup ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { projectId: string; label?: string; action?: string; content?: string };
  const { projectId, label, action, content } = body;
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const admin = await createAdminClient();

  // Verify ownership
  const { data: project } = await (admin as any)
    .from("projects").select("id, name").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (action === "restore") {
    if (!content?.trim()) {
      return NextResponse.json({ error: "content is required for restore" }, { status: 400 });
    }
    const parsed = parseSqlBackup(content);
    if (parsed.length === 0) {
      return NextResponse.json({ error: "No files found in backup — invalid or empty dump" }, { status: 400 });
    }

    await (admin as any).from("project_files").delete().eq("project_id", projectId);

    const rows = parsed.map((f) => ({
      project_id: projectId,
      path: f.path,
      content: f.content,
      language: f.language,
    }));

    const { error: insertErr } = await (admin as any).from("project_files").insert(rows);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    await (admin as any).from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);

    return NextResponse.json({
      ok: true,
      restored: parsed.length,
      files: parsed.map((f) => ({ path: f.path, content: f.content, language: f.language })),
    });
  }

  // ── Create backup (default) ──
  // Fetch all files for the project (these represent the DB seed + schema for AI-generated apps)
  const { data: files } = await (admin as any)
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", projectId)
    .order("path");

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No files to back up" }, { status: 400 });
  }

  // Build a SQL-style dump: each file is wrapped in a comment block
  const sqlDump = [
    `-- LifemarkAI Database Backup`,
    `-- Project: ${project.name}`,
    `-- Created: ${new Date().toISOString()}`,
    `-- Files: ${files.length}`,
    ``,
    ...files.map((f: { path: string; content: string; language: string }) => [
      `-- FILE: ${f.path}`,
      `-- LANGUAGE: ${f.language}`,
      `/*`,
      f.content,
      `*/`,
      ``,
    ].join("\n")),
  ].join("\n");

  const sizeBytes = Buffer.byteLength(sqlDump, "utf8");
  const backupLabel = label ?? `Backup ${new Date().toLocaleString()}`;
  const storagePath = `backups/${user.id}/${projectId}/${Date.now()}.sql`;

  // Insert backup record
  const { data: backup, error } = await (admin as any)
    .from("db_backups")
    .insert({
      project_id:   projectId,
      user_id:      user.id,
      label:        backupLabel,
      size_bytes:   sizeBytes,
      storage_path: storagePath,
      status:       "complete",
    })
    .select("id, label, size_bytes, status, created_at, storage_path")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return the SQL content inline (client can download it)
  return NextResponse.json({ ...backup, content: sqlDump }, { status: 201 });
}

// ── DELETE — remove backup record ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = await createAdminClient();
  await (admin as any).from("db_backups").delete().eq("id", id).eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
