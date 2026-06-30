/**
 * POST /api/editor-intelligence/review
 *
 * Read-only LifemarkAI technical review across architecture, scalability,
 * security, code quality, and cloud cost.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";
import { claimDailyCredits } from "@/lib/credits";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { ctoReview } from "@/lib/ai/editor-lenses/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = (await req.json()) as { projectId: string };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const rl = await rateLimitAsync(`editor-intelligence-review:${user.id}`, RATE_LIMITS.ai);
  if (!rl.success) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  await claimDailyCredits(supabase, user.id);
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();
  if (!profile || Number(profile.credits) <= 0) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  const { data: fileRows } = await (supabase as any)
    .from("project_files")
    .select("path, content")
    .eq("project_id", projectId);
  const files = (fileRows ?? [])
    .filter((f: { path?: string }) => typeof f.path === "string")
    .map((f: { path: string; content: string | null }) => ({ path: f.path, content: f.content ?? "" }));

  // Real spend for the cost lens, when available.
  let costSummary = { aiCents: 0, instanceCents: 0 };
  try {
    const { data: usage } = await (supabase as any)
      .from("lifemark_cloud_usage")
      .select("ai_cents, instance_cents")
      .eq("project_id", projectId);
    if (Array.isArray(usage)) {
      costSummary = usage.reduce(
        (acc: { aiCents: number; instanceCents: number }, r: { ai_cents?: number; instance_cents?: number }) => ({
          aiCents: acc.aiCents + (r.ai_cents ?? 0),
          instanceCents: acc.instanceCents + (r.instance_cents ?? 0),
        }),
        { aiCents: 0, instanceCents: 0 },
      );
    }
  } catch {
    /* usage table optional */
  }

  const report = await ctoReview({ projectId, userId: user.id, files, costSummary });

  await (supabase as any).rpc("deduct_credits", {
    user_id: user.id,
    amount: 1,
    action: "editor_intelligence_review",
    project_id: projectId,
  });

  return NextResponse.json(report);
}
