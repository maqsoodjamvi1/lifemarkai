/**
 * Project Titan AI v2.0 — orchestrator core.
 * See docs/titan/01-ai-software-company.md and docs/titan/02-autonomous-execution.md.
 *
 * Drives one Initiative end to end: discovery → planning → debate → wave-based
 * execution → verification, streaming TitanEvents as it goes. It depends ONLY on
 * existing LifemarkAI primitives:
 *   - generateAI()         (lib/ai/generate.ts)   — gateway-aware, billed
 *   - MODEL_TIERS          (lib/ai/editor-intelligence.ts)
 *   - the role definitions (lib/ai/titan/roles.ts)
 *
 * Persistence (agent_initiatives / agent_tasks / agent_runs / …) is performed by
 * the route handler via createAdminClient(); this module stays DB-agnostic and
 * yields events so it is unit-testable. P1 runs waves sequentially; the wave
 * structure is already parallel-ready (see runWave).
 */
import { generateAI } from "@/lib/ai/generate";
import type { AIMessage } from "@/lib/ai/provider";
import { getRole, resolveTier, TEAM_ROLE_IDS } from "./roles";
import type {
  AgentRoleId,
  AutonomyGates,
  CtoReport,
  Epic,
  InitiativeOptions,
  TitanEvent,
  TitanTask,
} from "./types";

const DEBATE_MAX_ROUNDS = 2;
const MAX_PARALLEL_TASKS = 3;
/** Tasks at/above this risk score convene a debate before execution. */
const DEBATE_RISK_THRESHOLD = 60;

const DEFAULT_GATES: AutonomyGates = {
  database: "ask",
  deploy: "ask",
  spend: "budget",
  liveEnv: "block",
};

/** Roughly estimate credits from tokens (mirrors fractional credit philosophy). */
function creditsForTokens(tokens: number): number {
  return Math.round((tokens / 1000) * 0.05 * 100) / 100;
}

interface RunCtx {
  opts: InitiativeOptions;
  gates: AutonomyGates;
  files: Map<string, string>;
  creditsUsed: number;
  filesChanged: Set<string>;
}

/** Call one role via generateAI with its resolved tier + role system prompt. */
async function callRole(
  ctx: RunCtx,
  role: AgentRoleId,
  userPrompt: string,
  opts: { jsonMode?: boolean } = {},
): Promise<string> {
  const def = getRole(role);
  const messages: AIMessage[] = [
    { role: "system", content: def.systemPrompt },
    { role: "user", content: userPrompt },
  ];
  const res = await generateAI(
    {
      model: resolveTier(def.tier),
      messages,
      jsonMode: opts.jsonMode,
      maxTokens: 4000,
    },
    { projectId: ctx.opts.projectId, userId: ctx.opts.userId },
  );
  ctx.creditsUsed += creditsForTokens(res.tokensUsed);
  return res.content;
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** PM decomposes the goal into epics + a task DAG. */
async function planInitiative(ctx: RunCtx): Promise<Epic[]> {
  const prompt = `Goal: ${ctx.opts.goal}
${ctx.opts.spec ? `Spec:\n${JSON.stringify(ctx.opts.spec).slice(0, 4000)}` : ""}

Decompose into epics and tasks. For each task include: id (kebab), role (one of
pm,ba,architect,designer,frontend,backend,database,devops,qa,security), title,
acceptance, dependsOn (array of task ids), risk (0-100). Return JSON:
{"epics":[{"title":"...","tasks":[{"id":"...","role":"...","title":"...","acceptance":"...","dependsOn":[],"risk":0}]}]}`;
  const raw = await callRole(ctx, "pm", prompt, { jsonMode: true });
  const parsed = safeJson<{ epics: Epic[] }>(raw, { epics: [] });
  // Normalize task fields.
  for (const epic of parsed.epics) {
    for (const t of epic.tasks as TitanTask[]) {
      t.status = "pending";
      t.dependsOn = t.dependsOn ?? [];
      t.risk = typeof t.risk === "number" ? t.risk : 0;
    }
  }
  return parsed.epics;
}

/** Bounded, veto-scoped debate; escalates to the CTO if unresolved. Yields events. */
async function* debate(
  ctx: RunCtx,
  topic: string,
): AsyncGenerator<TitanEvent, { decision: string; decidedBy: string }> {
  let proposal = await callRole(
    ctx,
    "architect",
    `Propose an approach for: ${topic}. Give the choice and a one-paragraph rationale.`,
  );
  yield { type: "agent_message", from: "architect", channel: "debate", content: proposal };

  const critics: AgentRoleId[] = ["security", "devops", "database"];
  for (let round = 1; round <= DEBATE_MAX_ROUNDS; round++) {
    yield { type: "debate_status", topic, round };
    let objection = false;
    for (const critic of critics) {
      const reply = await callRole(
        ctx,
        critic,
        `Critique this proposal for "${topic}" from your role's lens. If acceptable, reply "+1". If not, state the concern.\n\nProposal:\n${proposal}`,
      );
      yield { type: "agent_message", from: critic, channel: "debate", content: reply };
      if (!/\+1/.test(reply)) objection = true;
    }
    if (!objection) {
      return { decision: proposal, decidedBy: "consensus" };
    }
    // Architect revises before the next round.
    proposal = await callRole(
      ctx,
      "architect",
      `Revise your proposal for "${topic}" to address the critics' concerns.\n\nCurrent:\n${proposal}`,
    );
    yield { type: "agent_message", from: "architect", channel: "debate", content: proposal };
  }

  // Unresolved → CTO ruling (binding).
  const ruling = await callRole(
    ctx,
    "cto",
    `The team could not reach consensus on "${topic}". Issue a binding ruling with rationale and a short ADR.\n\nLast proposal:\n${proposal}`,
  );
  yield { type: "agent_message", from: "cto", channel: "debate", content: ruling };
  return { decision: ruling, decidedBy: "cto" };
}

/** Execute one task by calling its owning role. Yields file_change events. */
async function* runTask(ctx: RunCtx, task: TitanTask): AsyncGenerator<TitanEvent> {
  yield { type: "task_status", taskId: task.id, role: task.role, status: "in_progress" };

  const def = getRole(task.role);
  const writes = def.tools.includes("write_file");

  // Live-environment lock (migration 046) for any code-writing role.
  if (writes && ctx.opts.environment === "live") {
    yield { type: "task_status", taskId: task.id, role: task.role, status: "failed" };
    yield { type: "error", message: `environment_locked: ${task.id}` };
    task.status = "failed";
    return;
  }

  // Code-writing role with a real executor wired (route → agent.ts 10-tool loop).
  if (writes && ctx.opts.executeCodeTask) {
    try {
      const result = await ctx.opts.executeCodeTask({
        role: task.role,
        title: task.title,
        acceptance: task.acceptance,
        files: [...ctx.files.entries()].map(([path, content]) => ({ path, content })),
      });
      for (const f of result.files) {
        ctx.files.set(f.path, f.content);
        ctx.filesChanged.add(f.path);
        yield { type: "file_change", path: f.path };
      }
      task.result = result.summary;
      task.status = "done";
      yield { type: "task_status", taskId: task.id, role: task.role, status: "done" };
      return;
    } catch (err) {
      task.status = "failed";
      yield { type: "task_status", taskId: task.id, role: task.role, status: "failed" };
      yield { type: "error", message: `task ${task.id} failed: ${err instanceof Error ? err.message : String(err)}` };
      return;
    }
  }

  const fileList = [...ctx.files.keys()].slice(0, 60).join("\n");
  const prompt = `Task: ${task.title}
Acceptance: ${task.acceptance ?? "n/a"}
Project files:\n${fileList}

${writes
    ? `Produce the file(s) for this task. Return JSON {"files":[{"path":"...","content":"..."}]}.`
    : `Produce your deliverable as markdown.`}`;

  const raw = await callRole(ctx, task.role, prompt, { jsonMode: writes });

  if (writes) {
    const parsed = safeJson<{ files: Array<{ path: string; content: string }> }>(raw, { files: [] });
    for (const f of parsed.files) {
      ctx.files.set(f.path, f.content);
      ctx.filesChanged.add(f.path);
      yield { type: "file_change", path: f.path };
    }
  } else {
    task.result = raw;
  }

  task.status = "done";
  yield { type: "task_status", taskId: task.id, role: task.role, status: "done" };
}

/** Topologically group ready tasks into parallel waves. */
function nextWave(tasks: TitanTask[]): TitanTask[] {
  const done = new Set(tasks.filter((t) => t.status === "done" || t.status === "skipped").map((t) => t.id));
  return tasks
    .filter((t) => t.status === "pending" && t.dependsOn.every((d) => done.has(d)))
    .slice(0, MAX_PARALLEL_TASKS);
}

/**
 * Run a full initiative. Async generator of TitanEvents (doc 07 §3).
 * P1: waves execute sequentially internally; structure is parallel-ready.
 */
export async function* runInitiative(opts: InitiativeOptions): AsyncGenerator<TitanEvent> {
  const ctx: RunCtx = {
    opts,
    gates: { ...DEFAULT_GATES, ...opts.autonomy },
    files: new Map(opts.files.map((f) => [f.path, f.content])),
    creditsUsed: 0,
    filesChanged: new Set(),
  };

  yield { type: "initiative_status", status: "planning" };

  // 1) Discovery (BA) + planning (PM)
  yield { type: "agent_status", role: "ba", state: "running", summary: "Product discovery" };
  await callRole(ctx, "ba", `Run product discovery for: ${opts.goal}. Summarize personas + key features.`);
  yield { type: "agent_status", role: "ba", state: "done" };

  yield { type: "agent_status", role: "pm", state: "running", summary: "Planning" };
  const epics = await planInitiative(ctx);
  yield { type: "agent_status", role: "pm", state: "done" };
  yield { type: "plan", epics };

  const tasks: TitanTask[] = epics.flatMap((e) => e.tasks as TitanTask[]);
  if (tasks.length === 0) {
    yield { type: "error", message: "Planning produced no tasks." };
    yield { type: "done", initiativeId: opts.projectId, filesChanged: [], creditsUsed: ctx.creditsUsed };
    return;
  }

  // 2) Debate high-risk decisions before execution
  yield { type: "initiative_status", status: "debating" };
  const highRisk = tasks.filter((t) => t.risk >= DEBATE_RISK_THRESHOLD);
  for (const t of highRisk) {
    const result = yield* debate(ctx, t.title);
    yield {
      type: "decision",
      topic: t.title,
      decision: result.decision.slice(0, 280),
      decidedBy: result.decidedBy,
    };
  }

  // 3) Wave-based execution
  yield { type: "initiative_status", status: "executing" };
  let waveNo = 0;
  let guard = 0;
  while (guard++ < 100) {
    const wave = nextWave(tasks);
    if (wave.length === 0) break;
    waveNo++;
    yield { type: "wave_start", wave: waveNo, taskIds: wave.map((t) => t.id) };

    // Budget gate (doc 02 §5): pause rather than overspend.
    if (
      ctx.gates.spend === "budget" &&
      opts.budgetCredits != null &&
      ctx.creditsUsed >= opts.budgetCredits
    ) {
      yield { type: "gate", kind: "spend", needsApproval: true };
      break;
    }

    for (const task of wave) {
      yield* runTask(ctx, task);
    }
  }

  // 4) Verification (QA) — the route handler wires the real self-verify.ts loop.
  yield { type: "verify_status", ok: tasks.every((t) => t.status !== "failed") };

  yield { type: "initiative_status", status: "done" };
  yield {
    type: "done",
    initiativeId: opts.projectId,
    filesChanged: [...ctx.filesChanged],
    creditsUsed: ctx.creditsUsed,
  };
}

/** "Act as CTO" — read-only review across five lenses (doc 03 §2). */
export async function ctoReview(opts: {
  projectId: string;
  userId: string;
  files: Array<{ path: string; content: string }>;
  costSummary?: { aiCents: number; instanceCents: number };
}): Promise<CtoReport> {
  const ctx: RunCtx = {
    opts: { projectId: opts.projectId, userId: opts.userId, goal: "cto-review", files: opts.files },
    gates: DEFAULT_GATES,
    files: new Map(opts.files.map((f) => [f.path, f.content])),
    creditsUsed: 0,
    filesChanged: new Set(),
  };
  const fileList = opts.files.map((f) => f.path).slice(0, 80).join("\n");
  const raw = await callRole(
    ctx,
    "cto",
    `Review this project across five lenses: architecture, scalability, security,
code quality, cloud cost. Return JSON {"recommendations":[{"lens":"...","impact":"high|med|low","effort":"high|med|low","finding":"...","action":"..."}]}.
Files:\n${fileList}`,
    { jsonMode: true },
  );
  const parsed = safeJson<{ recommendations: CtoReport["recommendations"] }>(raw, { recommendations: [] });
  return {
    recommendations: parsed.recommendations ?? [],
    costSummary: opts.costSummary ?? { aiCents: 0, instanceCents: 0 },
  };
}

export const TITAN_TEAM = TEAM_ROLE_IDS;
