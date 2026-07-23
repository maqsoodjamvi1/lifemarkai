// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateAI } from "@/lib/ai/generate";
import { getDefaultAiModel } from "@/lib/ai/model-defaults";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { runHealthScan } from "@/lib/ai/self-healing";
import {
  cancelCreditReservation,
  reserveCredits,
  settleCreditReservation,
  type CreditReservation,
} from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Self-Healing findings API (Editor Intelligence P2 — approval-gated auto-fix).
 *
 * GET  /api/projects/[id]/health
 *   → { findings: HealthFinding[] }   (owner-only)
 *
 * POST /api/projects/[id]/health
 *   { action: "scan" }                        → run the static scan now (free)
 *   { action: "propose_fix", findingId }      → AI-generated fix stored in
 *                                               proposed_fix, status 'fix_proposed'
 *                                               (1 credit)
 *   { action: "apply_fix", findingId }        → APPROVAL GATE: writes the proposed
 *                                               files to project_files, status 'fixed'.
 *                                               423 when environment === 'live'.
 *   { action: "dismiss", findingId }          → status 'dismissed'
 */

interface Params { params: Promise<{ id: string }> }

async function getOwnedProject(supabase: any, projectId: string, userId: string) {
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, name, environment")
    .eq("id", projectId)
    .single();
  if (!project || project.user_id !== userId) return null;
  return project;
}

export async function GET(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(supabase, id, user.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: findings, error } = await (supabase as any)
    .from("health_findings")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ findings: findings ?? [] });
}

/** Strip a wrapping markdown code fence the model may add despite instructions. */
function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseFixJson(raw: string): { files: Array<{ path: string; content: string }>; summary?: string } | null {
  const attempt = (text: string) => {
    try { return JSON.parse(text); } catch { return null; }
  };
  const stripped = stripFence(raw);
  let parsed = attempt(stripped);
  if (!parsed) {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) parsed = attempt(match[0]);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.files)) return null;
  const files = parsed.files.filter(
    (f: any) =>
      f && typeof f.path === "string" && f.path.length > 0 &&
      typeof f.content === "string" && f.content.length > 0
  );
  if (files.length === 0) return null;
  return { files, summary: typeof parsed.summary === "string" ? parsed.summary : undefined };
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(supabase, id, user.id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;
  const findingId = body?.findingId as string | undefined;

  // ── Scan now (static analyzers, no AI cost) ────────────────────────────────
  if (action === "scan") {
    try {
      const { findings } = await runHealthScan({ supabase, projectId: id, userId: user.id });
      return NextResponse.json({ ok: true, findings });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Scan failed" },
        { status: 500 }
      );
    }
  }

  if (!findingId || typeof findingId !== "string") {
    return NextResponse.json({ error: "findingId required" }, { status: 400 });
  }

  const { data: finding } = await (supabase as any)
    .from("health_findings")
    .select("*")
    .eq("id", findingId)
    .eq("project_id", id)
    .single();
  if (!finding) return NextResponse.json({ error: "Finding not found" }, { status: 404 });

  // ── Dismiss ────────────────────────────────────────────────────────────────
  if (action === "dismiss") {
    const { data: updated, error } = await (supabase as any)
      .from("health_findings")
      .update({ status: "dismissed" })
      .eq("id", findingId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, finding: updated });
  }

  // ── Propose fix (AI, 1 credit) ─────────────────────────────────────────────
  if (action === "propose_fix") {
    if (finding.status === "fixed" || finding.status === "dismissed") {
      return NextResponse.json({ error: "Finding is already resolved" }, { status: 400 });
    }

    const rl = await rateLimitAsync(user.id, RATE_LIMITS.ai);
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    // Context: the flagged file plus package.json (dependency fixes need it).
    const wantedPaths = [finding.file_path, "package.json"].filter(Boolean);
    const { data: contextRows } = await (supabase as any)
      .from("project_files")
      .select("path, content")
      .eq("project_id", id)
      .in("path", wantedPaths);
    const contextFiles = (contextRows ?? []).map((f: any) => ({
      path: f.path,
      content: (f.content ?? "").slice(0, 60_000),
    }));

    const systemPrompt = `You are LifemarkAI's self-healing engine. Fix exactly ONE health finding in a user's app by returning complete replacement file contents.

Rules:
- Return ONLY valid JSON, no prose, no code fences: {"summary": "<one sentence>", "files": [{"path": "<path>", "content": "<FULL new file content>"}]}
- Each entry in "files" fully REPLACES that file — return the complete file, never a diff or snippet.
- Make the minimal change that resolves the finding; preserve all unrelated code, formatting, and behavior.
- Never invent secrets or credentials; reference environment variables instead.
- Only touch files needed for this fix (usually just one).`;

    const userPrompt = `Finding to fix:
- Category: ${finding.category}
- Severity: ${finding.severity}
- Title: ${finding.title}
- Detail: ${finding.detail ?? "n/a"}
- File: ${finding.file_path ?? "n/a"}

Current file contents:
${contextFiles.length > 0
  ? contextFiles.map((f: any) => `--- ${f.path} ---\n${f.content}`).join("\n\n")
  : "(no file content available — propose the file(s) that resolve the finding)"}`;

    let creditReservation: CreditReservation | null = null;
    let providerReturned = false;
    let reservationFinalized = false;
    try {
      creditReservation = await reserveCredits(supabase, {
        userId: user.id,
        amount: 1,
        action: "health_propose_fix",
        projectId: id,
      });
      if (!creditReservation) {
        return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
      }

      const result = await generateAI(
        {
          model: getDefaultAiModel(),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 8000,
          temperature: 0.2,
          stream: false,
        },
        { projectId: id, userId: user.id, task: "health_fix" }
      );
      providerReturned = true;

      // A provider response is billable even when its JSON is invalid or the
      // proposed-fix persistence step later fails.
      const remainingCredits = await settleCreditReservation(
        supabase,
        creditReservation.id,
        1,
      );
      if (remainingCredits == null) throw new Error("Unable to settle reserved health-fix credits");
      reservationFinalized = true;

      const fix = parseFixJson(result.content ?? "");
      if (!fix) {
        return NextResponse.json({ error: "AI returned an invalid fix" }, { status: 502 });
      }

      const proposedFix = {
        files: fix.files,
        summary: fix.summary ?? finding.title,
        proposed_at: new Date().toISOString(),
      };
      const { data: updated, error: updateErr } = await (supabase as any)
        .from("health_findings")
        .update({ proposed_fix: proposedFix, status: "fix_proposed" })
        .eq("id", findingId)
        .select()
        .single();
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

      return NextResponse.json({ ok: true, finding: updated });
    } catch (err) {
      if (creditReservation && !reservationFinalized) {
        try {
          if (providerReturned) {
            await settleCreditReservation(supabase, creditReservation.id, 1);
          } else {
            await cancelCreditReservation(supabase, creditReservation.id);
          }
        } catch {
          // Fail closed if provider work may already exist.
        }
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "AI failed" },
        { status: 500 }
      );
    }
  }

  // ── Apply fix (APPROVAL GATE — user explicitly confirmed) ──────────────────
  if (action === "apply_fix") {
    // Live environment lock (migration 046): never write code while Live.
    if (project.environment === "live") {
      return NextResponse.json(
        { error: "Project is in Live mode — switch to Test to apply fixes.", environment_locked: true },
        { status: 423 }
      );
    }

    const allFixFiles = finding.proposed_fix?.files;
    if (finding.status !== "fix_proposed" || !Array.isArray(allFixFiles) || allFixFiles.length === 0) {
      return NextResponse.json({ error: "No proposed fix to apply — run propose_fix first" }, { status: 400 });
    }

    // Optional path filter — client Accept/Reject in the self-heal DiffViewer.
    const pathFilter = Array.isArray((body as { paths?: unknown }).paths)
      ? new Set(
          ((body as { paths: unknown[] }).paths)
            .filter((p): p is string => typeof p === "string" && p.length > 0),
        )
      : null;
    const fixFiles = pathFilter
      ? allFixFiles.filter((f: { path?: string }) => f?.path && pathFilter.has(f.path))
      : allFixFiles;
    if (fixFiles.length === 0) {
      return NextResponse.json({ error: "No accepted files to apply" }, { status: 400 });
    }

    const { error: upsertErr } = await (supabase as any).from("project_files").upsert(
      fixFiles.map((f: any) => ({ project_id: id, path: f.path, content: f.content })),
      { onConflict: "project_id,path" }
    );
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

    const { data: updated, error: statusErr } = await (supabase as any)
      .from("health_findings")
      .update({ status: "fixed" })
      .eq("id", findingId)
      .select()
      .single();
    if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, applied: fixFiles.length, finding: updated });
  }

  return NextResponse.json(
    { error: "Invalid action — expected scan | propose_fix | apply_fix | dismiss" },
    { status: 400 }
  );
}
