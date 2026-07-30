/**
 * Real parallel read-only subagents.
 *
 * The module next door (`subagents.ts`) is a keyword-scoring pass — no model call,
 * nothing concurrent. It was relabelled honestly rather than left implying agents
 * it did not have. This module is the capability it was implying.
 *
 * WHAT MAKES THESE REAL. Each subagent is an independent `generateAI` call issued
 * concurrently via `Promise.allSettled`, given its own narrow question and its own
 * slice of the codebase, returning a written finding. They are READ-ONLY by
 * construction: no tools are passed, so there is nothing they can call to change a
 * file. Their output only ever becomes prompt context for the main build.
 *
 * COST, WHICH WAS THE REASON THIS DID NOT EXIST.
 * Three calls on the FAST tier (`getFastAiModel()` — deepseek-v4-flash at roughly
 * $0.13/M in, $0.25/M out) with a hard 700-token output cap each and a trimmed
 * context. A typical run is a fraction of a cent, which is why this can be on by
 * default without moving the economy posture the rest of the product is tuned to.
 * It is NOT the coding tier and must not be: these agents summarise, they do not
 * write code.
 *
 * FAILURE IS NOT AN OUTAGE. Every call is independently settled and the whole
 * thing sits behind a wall-clock budget. If a model is slow, rate-limited or
 * broken, that agent contributes nothing and the build proceeds; if all three fail,
 * the caller falls back to the deterministic keyword scan, which is exactly what
 * ran before this module existed. A build must never fail because an optional
 * investigation did.
 */

import { generateAI } from "@/lib/ai/generate";
import { getFastAiModel } from "@/lib/ai/model-defaults";
import type { SubagentStep } from "@/lib/ai/subagents";

/** Hard ceiling on concurrent agents. Three is Lovable's shape and the cost anchor. */
export const MAX_PARALLEL_SUBAGENTS = 3;

/** Per-agent output cap. Findings are summaries; anything longer is not being read. */
const AGENT_MAX_TOKENS = 700;

/** Wall-clock budget for the whole fan-out. Past this, the build starts regardless. */
const FANOUT_BUDGET_MS = 20_000;

/** Characters of file content given to a single agent. */
const PER_AGENT_CONTEXT_CHARS = 12_000;

/** Default ON. Set PARALLEL_SUBAGENTS to off/0/false to fall back to the keyword scan. */
export function parallelSubagentsEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const v = (process.env.PARALLEL_SUBAGENTS ?? "").trim().toLowerCase();
  return !(v === "off" || v === "0" || v === "false");
}

export interface SubagentAssignment {
  id: string;
  /** Shown in the UI. */
  title: string;
  /** The single question this agent answers. */
  question: string;
  /** Files this agent is allowed to look at. */
  files: Array<{ path: string; content: string }>;
}

export interface ParallelSubagentResult {
  steps: SubagentStep[];
  contextBlock: string;
  /** True when at least one agent returned a finding. */
  anySucceeded: boolean;
  /** Per-agent outcome, for logging and for the activity trace. */
  outcomes: Array<{ id: string; ok: boolean; ms: number; error?: string }>;
}

const AGENT_SYSTEM = `You are a read-only investigator on a code team. You are given ONE narrow question and a slice of a codebase.

Rules:
- Answer ONLY the question asked. Do not review anything else.
- Cite concrete file paths and symbol names. A finding without a path is useless.
- If the answer is not in the files you were given, say so plainly. Do not speculate.
- You cannot edit anything. Do not propose diffs or write code blocks.
- Be brief: at most 6 short lines.`;

/**
 * Decide what to investigate, and with which files.
 *
 * Deliberately derived from the SAME keyword scoring the deterministic path uses —
 * that ranking is good at picking relevant files and there is no reason to pay a
 * model to re-derive it. The model calls are spent on reading the files, which is
 * the part scoring cannot do.
 */
export function planSubagents(
  message: string,
  files: Array<{ path: string; content?: string | null }>,
  rank: (paths: Array<{ path: string; content?: string | null }>, keywords: string[]) => string[],
): SubagentAssignment[] {
  const pick = (keywords: string[], limit: number) => {
    const chosen = rank(files, keywords).slice(0, limit);
    return chosen
      .map((p) => {
        const f = files.find((x) => x.path === p);
        return { path: p, content: (f?.content ?? "").slice(0, PER_AGENT_CONTEXT_CHARS) };
      })
      .filter((f) => f.content.length > 0);
  };

  const assignments: SubagentAssignment[] = [];

  if (/\bauth|login|signup|session|oauth|permission|role\b/i.test(message)) {
    assignments.push({
      id: "sa-auth",
      title: "Investigating auth and session handling",
      question:
        "How does authentication and session state work in this project today? Name the files, the client used, and where the session is read.",
      files: pick(["auth", "login", "session", "user", "supabase"], 4),
    });
  }

  if (/\bdashboard|admin|layout|nav|route|page\b/i.test(message)) {
    assignments.push({
      id: "sa-layout",
      title: "Investigating routing and layout",
      question:
        "How is routing and page layout structured? Name the router, where routes are declared, and the shared layout components.",
      files: pick(["layout", "nav", "route", "header", "sidebar", "app"], 4),
    });
  }

  if (/\bdata|database|table|schema|query|api\b/i.test(message)) {
    assignments.push({
      id: "sa-data",
      title: "Investigating data access",
      question:
        "How does this project read and write data? Name the client, the tables or endpoints referenced, and any shared query helpers.",
      files: pick(["supabase", "query", "api", "db", "schema", "model"], 4),
    });
  }

  // Always include a general pass so there is at least one agent.
  assignments.push({
    id: "sa-codebase",
    title: "Investigating the areas this change touches",
    question: `The user asked: "${message.slice(0, 300)}". Which existing files will this change need to touch, and what already exists that should be reused rather than rewritten?`,
    files: pick(message.toLowerCase().split(/\s+/).filter((w) => w.length > 3), 5),
  });

  return assignments.filter((a) => a.files.length > 0).slice(0, MAX_PARALLEL_SUBAGENTS);
}

/** Run one agent. Never throws — the caller settles all of them together. */
async function runOne(
  a: SubagentAssignment,
  ctx: { projectId?: string; userId?: string },
): Promise<{ id: string; ok: boolean; ms: number; finding?: string; error?: string }> {
  const started = Date.now();
  try {
    const fileBlock = a.files
      .map((f) => `=== ${f.path} ===\n${f.content}`)
      .join("\n\n");

    const res = await generateAI(
      {
        model: getFastAiModel(),
        messages: [
          { role: "system" as const, content: AGENT_SYSTEM },
          { role: "user" as const, content: `QUESTION: ${a.question}\n\nFILES:\n${fileBlock}` },
        ],
        maxTokens: AGENT_MAX_TOKENS,
        temperature: 0.1,
      },
      { ...ctx, task: `subagent.${a.id}` },
    );

    const finding = (res?.content ?? "").trim();
    if (!finding) {
      return { id: a.id, ok: false, ms: Date.now() - started, error: "empty response" };
    }
    return { id: a.id, ok: true, ms: Date.now() - started, finding };
  } catch (e) {
    return {
      id: a.id,
      ok: false,
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Fan out the assignments concurrently and assemble a context block.
 *
 * `onStep` streams status so the UI can show agents finishing independently rather
 * than all at once — which is the honest rendering now that they really are
 * concurrent.
 */
export async function runParallelSubagents(
  assignments: SubagentAssignment[],
  ctx: { projectId?: string; userId?: string } = {},
  onStep?: (step: SubagentStep) => void,
): Promise<ParallelSubagentResult> {
  const capped = assignments.slice(0, MAX_PARALLEL_SUBAGENTS);

  for (const a of capped) {
    onStep?.({
      id: a.id,
      title: a.title,
      type: "explore",
      status: "running",
      agent: true,
      filesInspected: a.files.map((f) => f.path),
    });
  }

  // A budget rather than an abort: an agent that overruns is simply not waited on.
  const budget = new Promise<never[]>((resolve) =>
    setTimeout(() => resolve([] as never[]), FANOUT_BUDGET_MS),
  );

  const settled = await Promise.race([
    Promise.allSettled(capped.map((a) => runOne(a, ctx))),
    budget.then(() => [] as PromiseSettledResult<Awaited<ReturnType<typeof runOne>>>[]),
  ]);

  const outcomes: ParallelSubagentResult["outcomes"] = [];
  const steps: SubagentStep[] = [];
  const findings: string[] = [];

  for (let i = 0; i < capped.length; i++) {
    const a = capped[i]!;
    const r = settled[i];
    const value = r && r.status === "fulfilled" ? r.value : undefined;

    if (value?.ok && value.finding) {
      outcomes.push({ id: a.id, ok: true, ms: value.ms });
      const step: SubagentStep = {
        id: a.id,
        title: a.title,
        type: "explore",
        status: "done",
        agent: true,
        filesInspected: a.files.map((f) => f.path),
        finding: value.finding.slice(0, 600),
      };
      steps.push(step);
      onStep?.(step);
      findings.push(`## ${a.title}\n${value.finding}`);
    } else {
      const error = value?.error ?? "timed out";
      outcomes.push({ id: a.id, ok: false, ms: value?.ms ?? FANOUT_BUDGET_MS, error });
      // Report the miss rather than showing a tick for work that did not happen.
      const step: SubagentStep = {
        id: a.id,
        title: a.title,
        type: "explore",
        status: "error",
        agent: true,
        filesInspected: a.files.map((f) => f.path),
        finding: `Could not complete (${error}). The build continued without this.`,
      };
      steps.push(step);
      onStep?.(step);
    }
  }

  const anySucceeded = findings.length > 0;
  const contextBlock = anySucceeded
    ? [
        "<subagent_findings>",
        "Read-only investigators reviewed the codebase before this build. Use their findings; do not re-derive them.",
        ...findings,
        "</subagent_findings>",
      ].join("\n\n")
    : "";

  return { steps, contextBlock, anySucceeded, outcomes };
}
