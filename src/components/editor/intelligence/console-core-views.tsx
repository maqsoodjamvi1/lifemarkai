/**
 * Console plan/debate/gate/footer views.
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
import type { TaskStatus } from "@/lib/ai/editor-lenses/types";
import {
  roleTitle,
  type ConsoleState,
  type FeedItem,
  type GateInfo,
  consoleHasActivity,
} from "./console-core-state";

const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  ready: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  in_progress: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  blocked: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  skipped: "bg-muted text-muted-foreground/60",
};

export function PlanTreeBase({ state }: { state: ConsoleState }) {
  if (state.epics.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        No plan yet. Start a build - the PM lens publishes epics and tasks here.
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
                      {wave !== undefined && (
                        <span className="ml-1.5 text-violet-700/80 dark:text-violet-300/80">· wave {wave}</span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] ${TASK_STATUS_BADGE[status] ?? TASK_STATUS_BADGE.pending}`}
                  >
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
                    - round {item.round} -
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
        Approval needed - {gate.kind}
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
        {state.done && <span className="text-emerald-400">{state.done.creditsUsed} credits</span>}
        {state.phase && <span className="ml-auto capitalize">{state.phase}</span>}
      </div>
    </div>
  );
}

export { PlanTreeBase as PlanTree };
