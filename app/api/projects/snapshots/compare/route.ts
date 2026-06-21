// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  reconstructFromChain,
  type SnapshotChainEntry,
  type SnapshotFile,
} from "@/lib/diff/snapshot-diff";
import { generateAI } from "@/lib/ai/provider";
import { FAST_CODING_MODEL } from "@/lib/ai/model-defaults";

/**
 * POST /api/projects/snapshots/compare
 * Body: { oldSnapshotId: string, newSnapshotId: string }
 *
 * Returns:
 *   {
 *     diffs: { path, before, after, language }[],
 *     summary: string  — AI-generated explanation of what changed and what might be breaking
 *     oldLabel, newLabel
 *   }
 *
 * This implements Lovable best-practice #6:
 *   "After every bug: Compare versions visually. You can prompt with:
 *    Compare version at T-1 to T-0. What changed? What might be breaking?"
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { oldSnapshotId, newSnapshotId } = await req.json() as {
    oldSnapshotId: string;
    newSnapshotId: string;
  };
  if (!oldSnapshotId || !newSnapshotId) {
    return NextResponse.json({ error: "oldSnapshotId and newSnapshotId required" }, { status: 400 });
  }

  // Verify ownership of both snapshots
  const { data: rows } = await supabase
    .from("project_snapshots")
    .select("id, user_id, label, created_at")
    .in("id", [oldSnapshotId, newSnapshotId]);

  if (!rows || rows.length !== 2) {
    return NextResponse.json({ error: "Snapshot pair not found" }, { status: 404 });
  }
  if (rows.some((r: any) => r.user_id !== user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const oldRow = rows.find((r: any) => r.id === oldSnapshotId);
  const newRow = rows.find((r: any) => r.id === newSnapshotId);

  // Reconstruct both snapshots' file lists by walking their parent chain
  const [{ data: oldChain }, { data: newChain }] = await Promise.all([
    supabase.rpc("get_snapshot_chain", { p_snapshot_id: oldSnapshotId }),
    supabase.rpc("get_snapshot_chain", { p_snapshot_id: newSnapshotId }),
  ]);
  const oldFiles: SnapshotFile[] = reconstructFromChain((oldChain ?? []) as SnapshotChainEntry[]);
  const newFiles: SnapshotFile[] = reconstructFromChain((newChain ?? []) as SnapshotChainEntry[]);

  // Build diffs
  const oldMap = new Map(oldFiles.map((f) => [f.path, f]));
  const newMap = new Map(newFiles.map((f) => [f.path, f]));
  const allPaths = new Set([...oldMap.keys(), ...newMap.keys()]);

  const diffs: Array<{ path: string; before: string; after: string; language: string; status: "added" | "removed" | "modified" }> = [];
  for (const path of allPaths) {
    const before = oldMap.get(path)?.content ?? "";
    const after = newMap.get(path)?.content ?? "";
    if (before === after) continue;
    const status = !oldMap.has(path) ? "added" : !newMap.has(path) ? "removed" : "modified";
    diffs.push({
      path,
      before,
      after,
      language: oldMap.get(path)?.language ?? newMap.get(path)?.language ?? "plaintext",
      status,
    });
  }

  // ── AI summary of what changed ─────────────────────────────────────────────
  let summary = "";
  if (diffs.length > 0) {
    // Build a compact diff digest for the AI (cap each file at 800 chars before/after)
    const digest = diffs
      .slice(0, 12) // limit to 12 files to keep token cost predictable
      .map((d) => {
        const beforeTrim = d.before.slice(0, 800);
        const afterTrim = d.after.slice(0, 800);
        return `## ${d.path} (${d.status})\n--- before ---\n${beforeTrim}\n--- after ---\n${afterTrim}`;
      })
      .join("\n\n");

    const systemPrompt = `You are a senior code reviewer. The user is comparing two project snapshots (T-1 = older, T-0 = newer). Tell them in 4-6 short sentences:
1. What changed (the substance, not file paths).
2. What might be breaking now that wasn't before.
3. What to test before keeping these changes.

Be specific and concrete. No filler. Use plain prose, no headings, no bullets.`;

    try {
      const aiRes = await generateAI({
        model: FAST_CODING_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Comparing snapshot "${oldRow?.label}" (T-1, ${oldRow?.created_at}) → "${newRow?.label}" (T-0, ${newRow?.created_at}).\n\nDiff digest:\n\n${digest}` },
        ],
        maxTokens: 600,
      });
      summary = (aiRes.content ?? "").trim();
    } catch (err) {
      summary = `Compared ${diffs.length} file${diffs.length === 1 ? "" : "s"}. (AI summary unavailable: ${(err as Error).message})`;
    }
  } else {
    summary = "These two snapshots are identical — no files differ.";
  }

  return NextResponse.json({
    diffs,
    summary,
    oldLabel: oldRow?.label ?? "T-1",
    newLabel: newRow?.label ?? "T-0",
    oldCreatedAt: oldRow?.created_at,
    newCreatedAt: newRow?.created_at,
  });
}
