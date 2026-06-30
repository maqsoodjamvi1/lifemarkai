/**
 * POST /api/editor-intelligence/initiative
 *
 * Runs LifemarkAI editor intelligence (lib/ai/editor-lenses/orchestrator.ts)
 * on a goal and STREAMS the run as SSE: lens statuses, the plan, debates,
 * decisions, wave/task progress, file changes, and a final done payload.
 *
 * Code-writing lenses execute through the real agent.ts ReAct loop (the full
 * 10-tool agent), so they actually read/edit/write files. Review chatter
 * and decisions are persisted to the migration-068 tables
 * (project_ai_agents / project_ai_agent_messages / project_ai_agent_decisions).
 *
 * Used by the Editor Intelligence panel and internal vibe-coding flows.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";
import { claimDailyCredits } from "@/lib/credits";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { runInitiative } from "@/lib/ai/editor-lenses/orchestrator";
import { getRole } from "@/lib/ai/editor-lenses/roles";
import { runAgent } from "@/lib/ai/agent";
import type { AgentRoleId, EditorIntelligenceEvent } from "@/lib/ai/editor-lenses/types";
import {
  appendEditorInitiativeEvent,
  createEditorInitiativeRun,
  ensureEditorLensRoster,
  failEditorInitiativeRun,
  loadEditorInitiativeRun,
  PERSISTED_ROLE_BY_LENS,
  updateEditorInitiativeCheckpoint,
} from "@/lib/ai/editor-lenses/persistence";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  projectId: string;
  goal?: string;
  runId?: string;
  budgetCredits?: number;
  /** Skip seeding the orchestrator's role rows (set false when the editor
   *  intelligence panel already bootstrapped the canonical lens roster). */
  seedAgents?: boolean;
}

interface DbError {
  message: string;
}

interface DbResult<T = unknown> {
  data: T | null;
  error: DbError | null;
}

interface LooseQuery<T = unknown> extends PromiseLike<DbResult<T>> {
  select(columns?: string, options?: Record<string, unknown>): LooseQuery<T>;
  eq(column: string, value: unknown): LooseQuery<T>;
  single(): Promise<DbResult<T>>;
  maybeSingle(): Promise<DbResult<T>>;
  insert(values: unknown): LooseQuery<T>;
  upsert(values: unknown, options?: Record<string, unknown>): LooseQuery<T>;
}

interface LooseSupabase {
  from<T = unknown>(table: string): LooseQuery<T>;
  rpc(fn: string, args?: Record<string, unknown>): Promise<DbResult>;
}

interface ProjectRow {
  id: string;
  name: string | null;
  environment?: string | null;
}

interface ProfileCreditsRow {
  credits: number | string | null;
}

interface ProjectFileRow {
  path?: string | null;
  content?: string | null;
}

interface AgentIdRow {
  id?: string | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const db = supabase as unknown as LooseSupabase;
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, goal, runId, budgetCredits, seedAgents = true } = (await req.json()) as Body;
  const requestedGoal = goal?.trim() ?? "";
  if (!projectId || (!runId && !requestedGoal)) {
    return NextResponse.json({ error: "projectId and goal are required for new runs" }, { status: 400 });
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Environment lock (migration 046): no code-writing on Live.
  const { data: project } = await db
    .from<ProjectRow>("projects")
    .select("id, name, environment")
    .eq("id", projectId)
    .single();
  if (project?.environment === "live") {
    return NextResponse.json({ environment_locked: true, error: "Project is Live" }, { status: 423 });
  }

  const rl = await rateLimitAsync(`editor-intelligence:${user.id}`, RATE_LIMITS.ai);
  if (!rl.success) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  // Credit gate (claim daily free credits first, like other AI routes).
  await claimDailyCredits(supabase, user.id);
  const { data: profile } = await db
    .from<ProfileCreditsRow>("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();
  if (!profile || Number(profile.credits) <= 0) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  // Load project files.
  const { data: fileRows } = await db
    .from<ProjectFileRow[]>("project_files")
    .select("path, content")
    .eq("project_id", projectId);
  const files = (fileRows ?? [])
    .filter((f): f is ProjectFileRow & { path: string } => typeof f.path === "string")
    .map((f) => ({ path: f.path, content: f.content ?? "" }));

  // Seed / refresh the internal editor-intelligence lenses (best-effort).
  // Skipped when the editor panel already owns the roster (seedAgents=false).
  if (seedAgents) try {
    await ensureEditorLensRoster(supabase, projectId, project?.name ?? "Untitled project", { seedKickoff: false });
  } catch {
    /* table optional / non-fatal */
  }

  const existingRun = runId ? await loadEditorInitiativeRun(supabase, runId) : null;
  if (runId && !existingRun) {
    return NextResponse.json({ error: "Initiative run not found" }, { status: 404 });
  }
  if (existingRun && existingRun.project_id !== projectId) {
    return NextResponse.json({ error: "Initiative run belongs to a different project" }, { status: 400 });
  }

  const initiativeRun = existingRun ?? await createEditorInitiativeRun({
    supabase,
    projectId,
    userId: user.id,
    goal: requestedGoal,
    budgetCredits: budgetCredits ?? null,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let clientGone = false;
      const send = (event: EditorIntelligenceEvent | Record<string, unknown>) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          clientGone = true;
        }
      };

      const agentIdByRole = new Map<string, string | null>();
      const persistMessage = async (fromRole: string, toRole: string | undefined, channel: string, content: string) => {
        try {
          const persistedRole = PERSISTED_ROLE_BY_LENS[fromRole as AgentRoleId] ?? fromRole;
          let agentId = agentIdByRole.get(persistedRole);
          if (!agentIdByRole.has(persistedRole)) {
            const { data: agent } = await db
              .from<AgentIdRow>("project_ai_agents")
              .select("id")
              .eq("project_id", projectId)
              .eq("role", persistedRole)
              .maybeSingle();
            const loadedAgentId = typeof agent?.id === "string" ? agent.id : null;
            agentId = loadedAgentId;
            agentIdByRole.set(persistedRole, loadedAgentId);
          }

          await db.from("project_ai_agent_messages").insert({
            project_id: projectId,
            agent_id: agentId ?? null,
            phase: channel,
            content,
            metadata: {
              from_role: fromRole,
              persisted_role: persistedRole,
              to_role: toRole ?? null,
            },
          });
        } catch {
          /* non-fatal */
        }
      };
      const persistDecision = async (topic: string, decision: string, decidedBy: string) => {
        try {
          await db.from("project_ai_agent_decisions").insert({
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
        const runStartEvent = {
          type: "initiative_run",
          initiativeId: initiativeRun.id,
          status: initiativeRun.status,
          resumed: !!existingRun,
        };
        send(runStartEvent);
        await appendEditorInitiativeEvent({
          supabase,
          initiativeId: initiativeRun.id,
          projectId,
          event: runStartEvent,
        });

        for await (const event of runInitiative({
          initiativeId: initiativeRun.id,
          projectId,
          userId: user.id,
          goal: initiativeRun.goal ?? requestedGoal,
          files,
          budgetCredits: Number(initiativeRun.budget_credits ?? budgetCredits ?? 0) || undefined,
          checkpoint: initiativeRun.checkpoint ?? null,
          onCheckpoint: (checkpoint) => updateEditorInitiativeCheckpoint({
            supabase,
            initiativeId: initiativeRun.id,
            checkpoint,
          }),
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
                await db.from("project_files").upsert(
                  changedFiles.map((f) => ({ project_id: projectId, path: f.path, content: f.content })),
                  { onConflict: "project_id,path" },
                );
              } catch {
                /* non-fatal - still report the change in the stream */
              }
            }
            return { files: changedFiles, summary: result.summary };
          },
        })) {
          send(event);
          await appendEditorInitiativeEvent({
            supabase,
            initiativeId: initiativeRun.id,
            projectId,
            event,
          });
          if (event.type === "agent_message") {
            await persistMessage(event.from, event.to, event.channel, event.content);
          } else if (event.type === "decision") {
            await persistDecision(event.topic, event.decision, event.decidedBy);
          } else if (event.type === "done") {
            creditsUsed = event.creditsUsed;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const event = { type: "error", message };
        send(event);
        await appendEditorInitiativeEvent({
          supabase,
          initiativeId: initiativeRun.id,
          projectId,
          event,
        }).catch(() => {});
        await failEditorInitiativeRun({
          supabase,
          initiativeId: initiativeRun.id,
          error: message,
        }).catch(() => {});
      }

      // Debit credits for the run (files were persisted per-task above).
      try {
        const debit = Math.max(1, Math.ceil(creditsUsed));
        await db.rpc("deduct_credits", {
          user_id: user.id,
          amount: debit,
          action: "editor_intelligence_build",
          project_id: projectId,
        });
      } catch {
        /* non-fatal */
      }

      if (!clientGone) {
        try { controller.close(); } catch { /* already closed */ }
      }
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
