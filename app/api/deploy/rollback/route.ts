// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { reconstructFromChain, type SnapshotChainEntry } from "@/lib/diff/snapshot-diff";
import { logger } from "@/lib/logger";

/**
 * POST /api/deploy/rollback
 * Body: { projectId, deploymentId }
 *
 * Restores project files to the state captured in the deployment's linked snapshot.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, deploymentId } = await req.json() as { projectId: string; deploymentId: string };

  if (!projectId || !deploymentId) {
    return NextResponse.json({ error: "projectId and deploymentId required" }, { status: 400 });
  }

  // Verify ownership of both project and deployment
  const { data: deployment } = await (supabase as any)
    .from("deployments")
    .select("id, snapshot_id, url, user_id, project_id")
    .eq("id", deploymentId)
    .eq("project_id", projectId)
    .single();

  if (!deployment || deployment.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!deployment.snapshot_id) {
    return NextResponse.json(
      { error: "This deployment has no snapshot attached. Rollback is not available." },
      { status: 400 }
    );
  }

  // Walk snapshot chain to reconstruct file state
  const { data: chain, error: chainError } = await (supabase as any)
    .rpc("get_snapshot_chain", { p_snapshot_id: deployment.snapshot_id });

  if (chainError) {
    return NextResponse.json({ error: chainError.message }, { status: 500 });
  }

  const entries = (chain ?? []) as SnapshotChainEntry[];
  const restoredFiles = reconstructFromChain(entries);

  if (restoredFiles.length === 0) {
    return NextResponse.json({ error: "Snapshot is empty — nothing to restore." }, { status: 400 });
  }

  // Auto-snapshot current state before overwriting
  const { data: currentFiles } = await (supabase as any)
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", projectId);

  if (currentFiles && currentFiles.length > 0) {
    await (supabase as any).from("project_snapshots").insert({
      project_id: projectId,
      user_id: user.id,
      label: `Before rollback to deploy ${deploymentId.slice(0, 8)}`,
      is_baseline: true,
      files: currentFiles,
      patches: null,
      parent_id: null,
    });
  }

  // Upsert restored files
  for (const file of restoredFiles) {
    await (supabase as any).from("project_files").upsert({
      project_id: projectId,
      path: file.path,
      content: file.content,
      language: file.language ?? "plaintext",
    }, { onConflict: "project_id,path" });
  }

  // Delete any files not present in the restored snapshot
  const restoredPaths = new Set(restoredFiles.map((f) => f.path));
  if (currentFiles) {
    const toDelete = currentFiles.filter((f) => !restoredPaths.has(f.path));
    for (const f of toDelete) {
      await (supabase as any).from("project_files")
        .delete()
        .eq("project_id", projectId)
        .eq("path", f.path);
    }
  }

  logger.info("deploy.rollback", { projectId, deploymentId, fileCount: restoredFiles.length, userId: user.id });

  return NextResponse.json({
    ok: true,
    fileCount: restoredFiles.length,
    deployUrl: deployment.url,
  });
}
