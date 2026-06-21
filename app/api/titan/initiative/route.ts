/**
 * POST /api/titan/initiative
 *
 * Runs the Titan multi-agent "software company" (lib/ai/titan/orchestrator.ts)
 * on a goal and STREAMS the run as SSE: agent statuses, the plan, debates,
 * decisions, wave/task progress, file changes, and a final done payload.
 *
 * Code-writing roles execute through the real agent.ts ReAct loop (the full
 * 10-tool agent), so the agents actually read/edit/write files. Agent chatter
 * and decisions are persisted to the migration-068 tables
 * (project_ai_agents / project_ai_agent_messages / project_ai_agent_decisions).
 *
 * See docs/titan/01-ai-software-company.md and 07-service-contracts-api.md.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";
import { claimDailyCredits } from "@/lib/credits";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { runInitiative } from "@/lib/ai/titan/orchestrator";
import { TEAM_ROLE_IDS, getRole } from "@/lib/ai/titan/roles";
import { runAgent } from "@/lib/ai/agent";
import type { TitanEvent } from "@/lib/ai/titan/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  projectId: string;
  goal: string;
  budgetCredits?: number;
  /** Skip seeding the orchestrator's role rows (set false when the existing
   *  AI Company panel already bootstrapped the canonical agent roster). */
  seedAgents?: boolean;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, goal, budgetCredits, seedAgents = true } = (await req.json()) as Body;
  if (!projectId || !goal?.trim()) {
    return NextResponse.json({ error: "projectId and goal are required" }, { status: 400 });
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Environment lock (migration 046): no code-writing on Live.
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, environment")
    .eq("id", projectId)
    .single();
  if (project?.environment === "live") {
    return NextResponse.json({ environment_locked: true, error: "Project is Live" }, { status: 423 });
  }

  const rl = await rateLimitAsync(`titan:${user.id}`, RATE_LIMITS.ai);
  if (!rl.success) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  // Credit gate (claim daily free credits first, like other AI routes).
  await claimDailyCredits(supabase, user.id);
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();
  if (!profile || Number(profile.credits) <= 0) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  // Load project files.
  const { data: fileRows } = await (supabase as any)
    .from("project_files")
    .select("path, content")
    .eq("project_id", projectId);
  const files = (fileRows ?? [])
    .filter((f: { path?: string }) => typeof f.path === "string")
    .map((f: { path: string; content: string | null }) => ({ path: f.path, content: f.content ?? "" }));

  // Seed / refresh the agent company (best-effort). Skipped when the existing
  // AI Company panel already owns the roster (seedAgents=false).
  if (seedAgents) try {
    const rows = TEAM_ROLE_IDS.map((id) => {
      const r = getRole(id);
      return {
        project_id: projectId,
        role: r.id,
        name: r.title,
        title: r.title,
        responsibilities: r.produces,
        status: "idle",
      };
    });
    await (supabase as any).from("project_ai_agents").upsert(rows, { onConflict: "project_id,role" });
  } catch {
    /* table optional / non-fatal */
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: TitanEvent | Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const persistMessage = async (fromRole: string, toRole: string | undefined, channel: string, content: string) => {
        try {
          await (supabase as any).from("project_ai_agent_messages").insert({
            project_id: projectId,
            phase: channel,
            content,
            metadata: { from_role: fromRole, to_role: toRole ?? null },
          });
        } catch {
          /* non-fatal */
        }
      };
      const persistDecision = async (topic: string, decision: string, decidedBy: string) => {
        try {
          await (supabase as any).from("project_ai_agent_decisions").insert({
            project_id: projectId,
            title: topic,
            summary: decision,
            status: "accepted",
            metadata: { decided_by: decidedBy },
          });
        } catch {
          /* non-fatal */
        }
      };

      let creditsUsed = 0;
      try {
        for await (const event of runInitiative({
          projectId,
          userId: user.id,
          goal,
          files,
          budgetCredits,
          environment: "test",
          // Real executor: each code task runs the full agent.ts 10-tool loop.
          executeCodeTask: async ({ role, title, acceptance, files: taskFiles }) => {
            const changed = new Map<string, string>();
            const result = await runAgent({
              task: `${title}${acceptance ? `\n\nAcceptance criteria: ${acceptance}` : ""}`,
              projectId,
              files: taskFiles,
              knowledge: getRole(role).systemPrompt,
              maxIterations: 12,
              onStep: () => {},
              onFileChange: (p, c) => changed.set(p, c),
            });
            const changedFiles = [...changed.entries()].map(([path, content]) => ({ path, content }));
            // Persist the agent's file changes to project_files so the build is real.
            if (changedFiles.length) {
              try {
                await (supabase as any).from("project_files").upsert(
                  changedFiles.map((f) => ({ project_id: projectId, path: f.path, content: f.content })),
                  { onConflict: "project_id,path" },
                );
              } catch {
                /* non-fatal — still report the change in the stream */
              }
            }
            return { files: changedFiles, summary: result.summary };
          },
        })) {
          send(event);
          if (event.type === "agent_message") {
            await persistMessage(event.from, event.to, event.channel, event.content);
          } else if (event.type === "decision") {
            await persistDecision(event.topic, event.decision, event.decidedBy);
          } else if (event.type === "done") {
            creditsUsed = event.creditsUsed;
          }
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }

      // Debit credits for the run (files were persisted per-task above).
      try {
        const debit = Math.max(1, Math.ceil(creditsUsed));
        await (supabase as any).rpc("deduct_credits", {
          user_id: user.id,
          amount: debit,
          action: "titan_initiative",
          project_id: projectId,
        });
      } catch {
        /* non-fatal */
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
