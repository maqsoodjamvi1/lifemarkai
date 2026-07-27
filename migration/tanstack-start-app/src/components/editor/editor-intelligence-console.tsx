
/**
 * Editor Intelligence Console views (roadmap P1) — subcomponents + the event
 * reducer used by editor-intelligence-panel.tsx.
 *
 * Consumes the SSE contract from POST /api/editor-intelligence/initiative
 * (EditorIntelligenceEvent in lib/ai/editor-lenses/types.ts):
 *   agent_status  → TeamGrid role cards
 *   plan / task_status / wave_start → PlanTree
 *   agent_message / debate_status / decision → DebateFeed (threaded by channel)
 *   file_change / verify_status / done / error → RunFooter
 *   gate          → GateApprovalCard
 *
 * NOTE: only `import type` from lib/ai/editor-lenses — importing roles.ts at
 * runtime would pull the server AI SDKs (openai/@anthropic-ai/sdk via
 * MODEL_TIERS → provider.ts) into the client bundle. ROLE_META below mirrors
 * the display titles in lib/ai/editor-lenses/roles.ts — keep them in sync.
 */

import {
  AlertTriangle,
  CheckCircle2,
  FileDiff,
  Gavel,
  Loader2,
  ShieldQuestion,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  AgentRoleId,
  Epic,
  TaskStatus,
} from "@/lib/ai/editor-lenses/types";

/* ── Role metadata (mirrors lib/ai/editor-lenses/roles.ts titles) ─────────── */

export const ROLE_META: Record<AgentRoleId, { title: string; accent: string }> = {
  pm:        { title: "Product Manager",     accent: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  ba:        { title: "Business Analyst",    accent: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  architect: { title: "Technical Architect", accent: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  designer:  { title: "UI Designer",         accent: "border-pink-500/25 bg-pink-500/10 text-pink-700 dark:text-pink-300" },
  frontend:  { title: "Frontend Engineer",   accent: "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
  backend:   { title: "Backend Engineer",    accent: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  database:  { title: "Database Engineer",   accent: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  devops:    { title: "DevOps Engineer",     accent: "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  qa:        { title: "QA Engineer",         accent: "border-lime-500/25 bg-lime-500/10 text-lime-700 dark:text-lime-300" },
  security:  { title: "Security Engineer",   accent: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300" },
  cto:       { title: "AI CTO",              accent: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300" },
};

export const CONSOLE_ROLE_IDS = Object.keys(ROLE_META) as AgentRoleId[];

export function roleTitle(role: string): string {
  return ROLE_META[role as AgentRoleId]?.title ?? role;
}

/* ── Console state + event reducer ────────────────────────────────────────── */

export type RoleLiveState = "idle" | "running" | "done" | "error";

export type FeedItem =
  | { kind: "message"; seq: number; from: string; to?: string; channel: string; content: string }
  | { kind: "round"; seq: number; topic: string; round: number }
  | { kind: "decision"; seq: number; topic: string; decision: string; decidedBy: string; rationale?: string };

export interface GateInfo {
  kind: "database" | "deploy" | "spend";
  needsApproval: boolean;
}

export interface ConsoleState {
  runId: string | null;
  resumed: boolean;
  phase: string | null;
  roles: Partial<Record<AgentRoleId, { state: RoleLiveState; summary?: string }>>;
  epics: Epic[];
  taskStatus: Record<string, TaskStatus>;
  taskWave: Record<string, number>;
  currentWave: number | null;
  feed: FeedItem[];
  filesChanged: string[];
  verify: "pending" | "pass" | "fail";
  gate: GateInfo | null;
  error: string | null;
  done: { filesChanged: string[]; creditsUsed: number } | null;
}

export function initialConsoleState(): ConsoleState {
  return {
    runId: null,
    resumed: false,
    phase: null,
    roles: {},
    epics: [],
    taskStatus: {},
    taskWave: {},
    currentWave: null,
    feed: [],
    filesChanged: [],
    verify: "pending",
    gate: null,
    error: null,
    done: null,
  };
}

/** Fold one streamed/replayed event into the console state (pure). */
export function applyConsoleEvent(state: ConsoleState, ev: Record<string, unknown>): ConsoleState {
  const seq = state.feed.length;
  switch (ev.type) {
    case "initiative_run":
      return {
        ...state,
        runId: typeof ev.initiativeId === "string" ? ev.initiativeId : state.runId,
        resumed: !!ev.resumed,
      };
    case "initiative_status":
      return { ...state, phase: typeof ev.status === "string" ? ev.status : state.phase };
    case "agent_status": {
      const role = ev.role as AgentRoleId;
      if (!role) return state;
      return {
        ...state,
        roles: {
          ...state.roles,
          [role]: {
            state: (ev.state as RoleLiveState) ?? "idle",
            summary: typeof ev.summary === "string" ? ev.summary : state.roles[role]?.summary,
          },
        },
      };
    }
    case "plan": {
      const epics = Array.isArray(ev.epics) ? (ev.epics as Epic[]) : [];
      const taskStatus: Record<string, TaskStatus> = { ...state.taskStatus };
      for (const epic of epics) {
        for (const task of epic.tasks ?? []) {
          if (!(task.id in taskStatus)) taskStatus[task.id] = task.status ?? "pending";
        }
      }
      return { ...state, epics, taskStatus };
    }
    case "wave_start": {
      const wave = Number(ev.wave ?? 0);
      const taskWave = { ...state.taskWave };
      for (const id of (ev.taskIds as string[] | undefined) ?? []) taskWave[id] = wave;
      return { ...state, currentWave: wave, taskWave };
    }
    case "task_status": {
      const taskId = typeof ev.taskId === "string" ? ev.taskId : null;
      if (!taskId) return state;
      return {
        ...state,
        taskStatus: { ...state.taskStatus, [taskId]: (ev.status as TaskStatus) ?? "pending" },
      };
    }
    case "debate_status":
      return {
        ...state,
        feed: [...state.feed, { kind: "round", seq, topic: String(ev.topic ?? ""), round: Number(ev.round ?? 1) }],
      };
    case "agent_message":
      return {
        ...state,
        feed: [
          ...state.feed,
          {
            kind: "message",
            seq,
            from: String(ev.from ?? ""),
            to: typeof ev.to === "string" ? ev.to : undefined,
            channel: String(ev.channel ?? "general"),
            content: String(ev.content ?? ""),
          },
        ],
      };
    case "decision":
      return {
        ...state,
        feed: [
          ...state.feed,
          {
            kind: "decision",
            seq,
            topic: String(ev.topic ?? ""),
            decision: String(ev.decision ?? ""),
            decidedBy: String(ev.decidedBy ?? ""),
            rationale: typeof ev.rationale === "string" ? ev.rationale : undefined,
          },
        ],
      };
    case "file_change": {
      const path = typeof ev.path === "string" ? ev.path : null;
      if (!path || state.filesChanged.includes(path)) return state;
      return { ...state, filesChanged: [...state.filesChanged, path] };
    }
    case "gate":
      return {
        ...state,
        gate: {
          kind: (ev.kind as GateInfo["kind"]) ?? "spend",
          needsApproval: !!ev.needsApproval,
        },
      };
    case "verify_status":
      return { ...state, verify: ev.ok ? "pass" : "fail" };
    case "error":
      return { ...state, error: typeof ev.message === "string" ? ev.message : "Run failed" };
    case "done": {
      const doneFiles = Array.isArray(ev.filesChanged) ? (ev.filesChanged as string[]) : [];
      const merged = [...state.filesChanged];
      for (const p of doneFiles) if (!merged.includes(p)) merged.push(p);
      return {
        ...state,
        phase: "done",
        gate: null,
        filesChanged: merged,
        done: { filesChanged: doneFiles, creditsUsed: Number(ev.creditsUsed ?? 0) },
      };
    }
    default:
      return state;
  }
}

/** True once the console has anything worth rendering beyond the empty shell. */
export function consoleHasActivity(state: ConsoleState): boolean {
  return (
    state.runId !== null ||
    state.epics.length > 0 ||
    state.feed.length > 0 ||
    Object.keys(state.roles).length > 0 ||
    state.filesChanged.length > 0
  );
}

/* ── Team grid ─────────────────────────────────────────────────────────────── */

const ROLE_STATE_DOT: Record<RoleLiveState, string> = {
  idle: "bg-muted-foreground/40",
  running: "bg-violet-400 animate-pulse",
  done: "bg-emerald-400",
  error: "bg-red-400",
};

export function TeamGrid({ state }: { state: ConsoleState }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {CONSOLE_ROLE_IDS.map((id) => {
        const meta = ROLE_META[id];
        const live = state.roles[id];
        const liveState: RoleLiveState = live?.state ?? "idle";
        return (
          <div key={id} className="rounded-lg border border-border bg-muted/20 p-2.5">
            <div className="flex items-center gap-2">
              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${meta.accent}`}>
                {meta.title}
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${ROLE_STATE_DOT[liveState]}`} />
                {liveState}
              </span>
            </div>
            {live?.summary && (
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                {live.summary}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Plan tree ─────────────────────────────────────────────────────────────── */

const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  ready: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  in_progress: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  blocked: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  skipped: "bg-muted text-muted-foreground/60",
};

export function PlanTree({ state }: { state: ConsoleState }) {
  if (state.epics.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        No plan yet. Start a build — the PM lens publishes epics and tasks here.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {state.currentWave !== null && (
        <div className="flex items-center gap-2 text-[11px] text-violet-700 dark:text-violet-300">
          <Loader2 className={`h-3 w-3 ${state.done || state.error ? "" : "animate-spin"}`} />
          Wave {state.currentWave} {state.done ? "(finished)" : state.error ? "(stopped)" : "in progress"}
        </div>
      )}
      {state.epics.map((epic, i) => (
        <div key={`${epic.title}-${i}`} className="rounded-lg border border-border bg-muted/20">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold">{epic.title}</div>
          <div className="divide-y divide-border/60">
            {(epic.tasks ?? []).map((task) => {
              const status = state.taskStatus[task.id] ?? task.status ?? "pending";
              const wave = state.taskWave[task.id];
              return (
                <div key={task.id} className="flex items-start gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-foreground">{task.title}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {roleTitle(task.role)}
                      {wave !== undefined && <span className="ml-1.5 text-violet-700/80 dark:text-violet-300/80">· wave {wave}</span>}
                    </p>
                  </div>
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] ${TASK_STATUS_BADGE[status] ?? TASK_STATUS_BADGE.pending}`}>
                    {status.replace("_", " ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Debate feed (threaded by channel/topic) ──────────────────────────────── */

interface FeedThread {
  key: string;
  label: string;
  isDebate: boolean;
  items: FeedItem[];
}

function threadKeyOf(item: FeedItem): string {
  if (item.kind === "message") return item.channel;
  const topic = item.topic || "decision";
  return topic.startsWith("debate:") ? topic : `debate:${topic}`;
}

export function groupFeed(feed: FeedItem[]): FeedThread[] {
  const threads = new Map<string, FeedThread>();
  for (const item of feed) {
    const key = threadKeyOf(item);
    let thread = threads.get(key);
    if (!thread) {
      const isDebate = key.startsWith("debate:");
      thread = {
        key,
        label: isDebate ? `Debate: ${key.slice("debate:".length)}` : key,
        isDebate,
        items: [],
      };
      threads.set(key, thread);
    }
    thread.items.push(item);
  }
  return [...threads.values()];
}

export function DebateFeed({ state }: { state: ConsoleState }) {
  const threads = groupFeed(state.feed);
  if (threads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        No lens chatter yet. Debates, messages, and decisions stream here during a run.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {threads.map((thread) => (
        <div key={thread.key} className="rounded-lg border border-border bg-muted/20">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-[11px] font-semibold">
            {thread.isDebate && <Gavel className="h-3 w-3 text-amber-700 dark:text-amber-300" />}
            <span className="truncate">{thread.label}</span>
          </div>
          <div className="space-y-2 p-2.5">
            {thread.items.map((item) => {
              if (item.kind === "round") {
                return (
                  <div key={item.seq} className="text-center text-[10px] uppercase tracking-wide text-muted-foreground">
                    — round {item.round} —
                  </div>
                );
              }
              if (item.kind === "decision") {
                return (
                  <div key={item.seq} className="rounded-md border border-amber-500/25 bg-amber-500/10 p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      <Gavel className="h-3 w-3" />
                      Decision · by {roleTitle(item.decidedBy)}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-foreground">{item.decision}</p>
                    {item.rationale && (
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        Rationale: {item.rationale}
                      </p>
                    )}
                  </div>
                );
              }
              return (
                <div key={item.seq} className="rounded-md border border-border bg-background/40 p-2.5">
                  <div className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
                    {roleTitle(item.from)}
                    {item.to && <span className="text-muted-foreground"> → {roleTitle(item.to)}</span>}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {item.content}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Gate approval card ───────────────────────────────────────────────────── */

const GATE_COPY: Record<GateInfo["kind"], string> = {
  database: "The run wants to apply database changes (migrations).",
  deploy: "The run wants to deploy the app.",
  spend: "The credit budget for this run is exhausted.",
};

export function GateApprovalCard({
  gate,
  busy,
  onApprove,
  onDeny,
}: {
  gate: GateInfo;
  busy: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
        <ShieldQuestion className="h-3.5 w-3.5" />
        Approval needed — {gate.kind}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {GATE_COPY[gate.kind]} The run is paused at a checkpoint until you decide.
      </p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" className="h-7 flex-1 text-xs" onClick={onApprove} disabled={busy}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve & resume"}
        </Button>
        <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={onDeny} disabled={busy}>
          Deny
        </Button>
      </div>
    </div>
  );
}

/* ── Run footer ───────────────────────────────────────────────────────────── */

export function RunFooter({ state, building }: { state: ConsoleState; building: boolean }) {
  const show = consoleHasActivity(state) || building;
  if (!show) return null;
  return (
    <div className="space-y-1.5">
      {state.error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 p-2 text-[11px] text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="leading-relaxed">{state.error}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileDiff className="h-3 w-3" />
          {state.filesChanged.length} file{state.filesChanged.length === 1 ? "" : "s"} changed
        </span>
        <span className="flex items-center gap-1">
          {state.verify === "pass" ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">verified</span>
            </>
          ) : state.verify === "fail" ? (
            <>
              <XCircle className="h-3 w-3 text-red-400" />
              <span className="text-red-400">verify failed</span>
            </>
          ) : (
            <>
              <Loader2 className={`h-3 w-3 ${building ? "animate-spin" : ""}`} />
              verify pending
            </>
          )}
        </span>
        {state.done && (
          <span className="text-emerald-400">{state.done.creditsUsed} credits</span>
        )}
        {state.phase && <span className="ml-auto capitalize">{state.phase}</span>}
      </div>
    </div>
  );
}
