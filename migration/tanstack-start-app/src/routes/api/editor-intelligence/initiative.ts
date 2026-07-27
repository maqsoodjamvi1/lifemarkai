// @ts-nocheck
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
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";
import {
  cancelCreditReservation,
  reserveCredits,
  settleCreditReservation,
} from "@/lib/credits";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { runInitiative } from "@/lib/ai/editor-lenses/orchestrator";
import { getRole } from "@/lib/ai/editor-lenses/roles";
import { runAgent } from "@/lib/ai/agent";
import { runSelfVerification, type SelfVerifyResult } from "@/lib/ai/self-verify";
import { recordVerificationFindings } from "@/lib/ai/self-healing";
import type { AgentRoleId, AutonomyGates, EditorIntelligenceEvent } from "@/lib/ai/editor-lenses/types";
import {
  appendEditorInitiativeEvent,
  createEditorInitiativeRun,
  ensureEditorLensRoster,
  failEditorInitiativeRun,
  loadEditorInitiativeRun,
  PERSISTED_ROLE_BY_LENS,
  recordEditorIntelligenceBuild,
  updateEditorInitiativeCheckpoint,
} from "@/lib/ai/editor-lenses/persistence";


/**
 * Route time budget, in seconds.
 *
 * In the Next.js version this was `export const maxDuration = 300` — a framework
 * directive that Vercel read to set the function timeout, and which this module
 * also happened to consume below. TanStack Start has no such export, so the
 * migration stripped it; but line 45 still referenced the binding, which threw
 * `ReferenceError: maxDuration is not defined` AT MODULE SCOPE. Because
 * routeTree.gen.ts imports every route eagerly, that single throw took down the
 * entire router and every request 500'd.
 *
 * Kept as a plain local constant: the value is still the right self-verify
 * budget, it just no longer doubles as a platform directive. If this route is
 * ever deployed somewhere with a different timeout, change it here.
 */
const ROUTE_MAX_DURATION_SECONDS = 300;

/** Skip the QA self-verify loop when fewer than ~60s of the route budget remain. */
const VERIFY_TIME_CUTOFF_MS = (ROUTE_MAX_DURATION_SECONDS - 60) * 1000;
const INITIATIVE_MAX_CREDITS = 5;

interface Body {
  projectId: string;
  goal?: string;
  runId?: string;
  budgetCredits?: number;
  /** Skip seeding the orchestrator's role rows (set false when the editor
   *  intelligence panel already bootstrapped the canonical lens roster). */
  seedAgents?: boolean;
  /** Autonomy gate overrides — sent by the console's gate Approve button when
   *  resuming a paused run (e.g. { database: "allow" } or { spend: "unlimited" }).
   *  Sanitized below; `liveEnv` can never be overridden (migration 046). */
  autonomy?: Partial<AutonomyGates>;
}

/** Whitelist autonomy override values; drop anything unknown or unsafe. */
function sanitizeAutonomy(raw: unknown): Partial<AutonomyGates> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Record<string, unknown>;
  const out: Partial<AutonomyGates> = {};
  if (input.database === "never" || input.database === "ask" || input.database === "allow") {
    out.database = input.database;
  }
  if (input.deploy === "never" || input.deploy === "ask" || input.deploy === "allow") {
    out.deploy = input.deploy;
  }
  if (input.spend === "budget" || input.spend === "unlimited") {
    out.spend = input.spend;
  }
  // liveEnv is intentionally NOT overridable — always "block".
  return Object.keys(out).length ? out : undefined;
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

interface ProjectFileRow {
  path?: string | null;
  content?: string | null;
}

interface AgentIdRow {
  id?: string | null;
}

async function handlePOST(req: Request) {
  const routeStartedAt = Date.now();
  const supabase = await createClient();
  const db = supabase as unknown as LooseSupabase;
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, goal, runId, budgetCredits, seedAgents = true, autonomy: rawAutonomy } = (await req.json()) as Body;
  const autonomy = sanitizeAutonomy(rawAutonomy);
  const requestedGoal = goal?.trim() ?? "";
  if (!projectId || (!runId && !requestedGoal)) {
    return Response.json({ error: "projectId and goal are required for new runs" }, { status: 400 });
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Environment lock (migration 046): no code-writing on Live.
  const { data: project } = await db
    .from<ProjectRow>("projects")
    .select("id, name, environment")
    .eq("id", projectId)
    .single();
  if (project?.environment === "live") {
    return Response.json({ environment_locked: true, error: "Project is Live" }, { status: 423 });
  }

  const rl = await rateLimitAsync(`editor-intelligence:${user.id}`, RATE_LIMITS.ai);
  if (!rl.success) return Response.json({ error: "Rate limited" }, { status: 429 });

  const existingRun = runId ? await loadEditorInitiativeRun(supabase, runId) : null;
  if (runId && !existingRun) {
    return Response.json({ error: "Initiative run not found" }, { status: 404 });
  }
  if (existingRun && existingRun.project_id !== projectId) {
    return Response.json({ error: "Initiative run belongs to a different project" }, { status: 400 });
  }

  if (
    budgetCredits != null
    && (!Number.isFinite(budgetCredits) || budgetCredits < 0.5 || budgetCredits > INITIATIVE_MAX_CREDITS)
  ) {
    return Response.json(
      { error: `budgetCredits must be between 0.5 and ${INITIATIVE_MAX_CREDITS}` },
      { status: 400 },
    );
  }
  const storedBudget = Number(existingRun?.budget_credits ?? 0);
  const reservationCap = budgetCredits
    ?? (Number.isFinite(storedBudget) && storedBudget >= 0.5
      ? Math.min(storedBudget, INITIATIVE_MAX_CREDITS)
      : INITIATIVE_MAX_CREDITS);
  let creditReservation: Awaited<ReturnType<typeof reserveCredits>>;
  try {
    creditReservation = await reserveCredits(supabase, {
      userId: user.id,
      amount: reservationCap,
      action: "editor_intelligence_build",
      projectId,
      ttlSeconds: 900,
    });
  } catch (error) {
    console.error("Unable to reserve initiative credits:", error);
    return Response.json({ error: "Unable to reserve credits" }, { status: 500 });
  }
  if (!creditReservation) {
    return Response.json({ error: "Insufficient credits" }, { status: 402 });
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

  let initiativeRun;
  try {
    initiativeRun = existingRun ?? await createEditorInitiativeRun({
      supabase,
      projectId,
      userId: user.id,
      goal: requestedGoal,
      budgetCredits: reservationCap,
    });
  } catch (error) {
    await cancelCreditReservation(supabase, creditReservation.id).catch(() => {});
    console.error("Unable to create initiative run:", error);
    return Response.json({ error: "Unable to create initiative run" }, { status: 500 });
  }

  const startingCreditsUsed = Number(existingRun?.checkpoint?.creditsUsed ?? 0) || 0;
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

      // Real QA step (roadmap P1): after the run's file changes are persisted,
      // verify the build with the same lib/ai/self-verify.ts loop the chat and
      // agent routes use (headless Chromium when available, static smoke checks
      // otherwise, plus up to 2 auto-fix rounds). Progress streams as QA lens
      // agent_message events; the outcome streams as a verify_status event and
      // is persisted via recordEditorIntelligenceBuild. Verification is
      // best-effort and must NEVER fail the initiative (same stance as chat).
      const runQaVerification = async (filesChanged: string[]): Promise<SelfVerifyResult | null> => {
        if (filesChanged.length === 0) return null;

        // Respect the route's maxDuration budget — skip when <~60s remain.
        if (Date.now() - routeStartedAt > VERIFY_TIME_CUTOFF_MS) {
          const skipped: EditorIntelligenceEvent = {
            type: "agent_message",
            from: "qa",
            channel: "verification",
            content: "Skipping browser verification — not enough time left in this run.",
          };
          send(skipped);
          await appendEditorInitiativeEvent({
            supabase,
            initiativeId: initiativeRun.id,
            projectId,
            event: skipped,
          }).catch(() => {});
          return null;
        }

        try {
          const verification = await runSelfVerification({
            supabase,
            projectId,
            userId: user.id,
            emit: (status) => {
              const progress: EditorIntelligenceEvent = {
                type: "agent_message",
                from: "qa",
                channel: "verification",
                content: status,
              };
              send(progress);
              void appendEditorInitiativeEvent({
                supabase,
                initiativeId: initiativeRun.id,
                projectId,
                event: progress,
              }).catch(() => {});
              void persistMessage("qa", undefined, "verification", status);
            },
          });
          if (!verification) return null;

          const verifyEvent: EditorIntelligenceEvent = { type: "verify_status", ok: verification.passed };
          send(verifyEvent);
          await appendEditorInitiativeEvent({
            supabase,
            initiativeId: initiativeRun.id,
            projectId,
            event: verifyEvent,
          }).catch(() => {});

          // QA lens memory + decision trail (persistence.ts `verification` field).
          await recordEditorIntelligenceBuild({
            supabase,
            projectId,
            projectName: project?.name ?? null,
            source: "editor-intelligence",
            mode: "initiative",
            prompt: initiativeRun.goal ?? requestedGoal,
            filesChanged,
            verification,
          });

          // Errors that survived the auto-fix rounds become 'runtime' health
          // findings so the Self-Heal tab tracks them (best-effort).
          if (!verification.passed) {
            await recordVerificationFindings({
              supabase,
              projectId,
              userId: user.id,
              verification,
            });
          }

          return verification;
        } catch {
          return null;
        }
      };

      let creditsUsed = startingCreditsUsed;
      let agentCreditsThisRequest = 0;
      let billableWorkReturned = false;
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
          autonomy,
          budgetCredits: reservationCap,
          checkpoint: initiativeRun.checkpoint ?? null,
          onCreditUsage: (cumulative) => {
            creditsUsed = Math.max(creditsUsed, cumulative);
            if (cumulative > startingCreditsUsed) billableWorkReturned = true;
          },
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
              userId: user.id,
              files: taskFiles,
              knowledge: getRole(role).systemPrompt,
              maxIterations: 12,
              onStep: () => {},
              onFileChange: (p, c) => changed.set(p, c),
            });
            if (result.tokensUsed > 0) {
              billableWorkReturned = true;
              agentCreditsThisRequest += Math.round((result.tokensUsed / 1000) * 0.05 * 100) / 100;
            }
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
          // Intercept the final `done` event: run the real QA self-verify loop
          // first, then forward `done` with the verification attached so
          // appendEditorInitiativeEvent stores it on the run's `result` column.
          if (event.type === "done") {
            creditsUsed = event.creditsUsed;
            const verification = await runQaVerification(event.filesChanged);
            const doneEvent: EditorIntelligenceEvent = verification
              ? {
                  ...event,
                  // Include files rewritten by auto-fix rounds (already
                  // persisted to project_files by the self-verify loop).
                  filesChanged: [
                    ...new Set([...event.filesChanged, ...verification.fixedFiles.map((f) => f.path)]),
                  ],
                  verification,
                }
              : event;
            send(doneEvent);
            await appendEditorInitiativeEvent({
              supabase,
              initiativeId: initiativeRun.id,
              projectId,
              event: doneEvent,
            });
            continue;
          }

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

      // Settle only usage produced by this HTTP run. Checkpoint credits are
      // cumulative, so subtracting the starting value avoids double-charging a
      // resumed initiative.
      try {
        if (billableWorkReturned) {
          const roleCreditsThisRequest = Math.max(0, creditsUsed - startingCreditsUsed);
          const rawActual = roleCreditsThisRequest + agentCreditsThisRequest;
          const actual = Math.min(
            creditReservation.amount,
            Math.max(0.5, Math.ceil(rawActual * 20) / 20),
          );
          await settleCreditReservation(supabase, creditReservation.id, actual);
        } else {
          await cancelCreditReservation(supabase, creditReservation.id);
        }
      } catch (billingError) {
        // Leave an active reservation untouched if settlement fails; its TTL is
        // safer than refunding work that may already have been delivered.
        console.error("Initiative reservation settlement failed:", billingError);
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


export const Route = createFileRoute("/api/editor-intelligence/initiative")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
