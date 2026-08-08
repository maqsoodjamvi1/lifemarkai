
import { useState,useRef,useEffect,useMemo } from "react";
import { motion } from "framer-motion";
import {
Bot,Zap,ChevronDown,ChevronRight,Square,
CheckCircle,AlertCircle,Eye,Code2,Loader2,FileText,FilePlus2,Pencil,Trash2,List,Search,FolderSearch,
Crosshair,Image as ImageIcon,Wrench,ShieldCheck,Lightbulb,
Clock,Files,Terminal
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentStep } from "@/lib/ai/agent";
import { DEFAULT_CODING_MODEL } from "@/lib/ai/model-defaults";
import { AGENT_MIN_CREDITS } from "@/lib/ai/credit-cost";
import type { ProjectFile } from "@/types/database";

interface AgentPanelProps {
  projectId: string;
  files: ProjectFile[];
  onFilesUpdated: (files: ProjectFile[]) => void;
  onCreditsChange: (credits: number) => void;
  /** When true (Live environment), agent runs are blocked */
  isLocked?: boolean;
  credits: number;
}

interface AgentRun {
  id: string;
  task: string;
  steps: AgentStep[];
  status: "running" | "done" | "error";
  summary?: string;
  creditsUsed?: number;
  /** Epoch ms — set when the run is created; used for the elapsed-time readout */
  startedAt: number;
  /** Epoch ms — set on done/error/stop so elapsed freezes */
  finishedAt?: number;
}

const STEP_ICONS = {
  thought: { icon: "💭", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  action: { icon: "⚡", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  observation: { icon: "👁️", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  done: { icon: "✅", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  error: { icon: "❌", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
};

// ── Lovable-style structured Tasks view ─────────────────────────────────────
// Consecutive steps are grouped into phases by the tool the agent used.
// (Tool roster lives in lib/ai/agent.ts — buildTools().)

type Phase = "exploring" | "editing" | "verifying" | "other";

const EXPLORE_TOOLS = /^(read_file|list_files|search_code|glob_search|analyze_code|find_definition)$/;
const EDIT_TOOLS = /^(write_file|edit_file|delete_file|generate_image)$/;
// No verify tools exist yet in agent.ts — future-proof by name pattern.
const VERIFY_TOOLS = /(test|verify|lint|check)/i;

const PHASE_META: Record<Phase, { label: string; icon: LucideIcon; color: string }> = {
  exploring: { label: "Exploring", icon: Eye, color: "text-blue-400" },
  editing: { label: "Editing", icon: Pencil, color: "text-yellow-400" },
  verifying: { label: "Verifying", icon: ShieldCheck, color: "text-green-400" },
  other: { label: "Working", icon: Wrench, color: "text-muted-foreground" },
};

const TOOL_ICONS: Record<string, LucideIcon> = {
  read_file: FileText,
  write_file: FilePlus2,
  edit_file: Pencil,
  delete_file: Trash2,
  list_files: List,
  search_code: Search,
  glob_search: FolderSearch,
  analyze_code: Code2,
  find_definition: Crosshair,
  generate_image: ImageIcon,
  finish: CheckCircle,
};

const STEP_TYPE_ICONS: Record<AgentStep["type"], LucideIcon> = {
  thought: Lightbulb,
  action: Wrench,
  observation: Eye,
  done: CheckCircle,
  error: AlertCircle,
};

function phaseForTool(tool?: string): Phase {
  if (!tool) return "other";
  if (EXPLORE_TOOLS.test(tool)) return "exploring";
  if (EDIT_TOOLS.test(tool)) return "editing";
  if (VERIFY_TOOLS.test(tool)) return "verifying";
  return "other";
}

function stepFilePath(step: AgentStep): string | null {
  const p = step.args?.path;
  return typeof p === "string" ? p : null;
}

/** One-line summary: tool + its primary argument (file path / pattern / query). */
function stepSummary(step: AgentStep): string {
  if (step.tool) {
    const primary =
      stepFilePath(step) ??
      (typeof step.args?.pattern === "string" ? (step.args.pattern as string)
        : typeof step.args?.query === "string" ? (step.args.query as string)
        : typeof step.args?.symbol === "string" ? (step.args.symbol as string)
        : "");
    return primary ? `${step.tool} · ${primary}` : step.tool;
  }
  return step.content.split("\n")[0];
}

interface StepItem {
  step: AgentStep;
  /** Index into run.steps — shared with the raw log so expandedSteps works for both */
  index: number;
  /** Observation emitted right after this action, folded into its expanded detail */
  observation?: AgentStep;
}

interface StepGroup {
  phase: Phase;
  items: StepItem[];
  /** Unique file paths touched by this phase's steps */
  files: string[];
  /** Raw step count incl. folded observations */
  stepCount: number;
}

function groupSteps(steps: AgentStep[]): StepGroup[] {
  const groups: StepGroup[] = [];
  let pendingThoughts: StepItem[] = [];

  const push = (phase: Phase, item: StepItem) => {
    let target = groups[groups.length - 1];
    if (!target || target.phase !== phase) {
      target = { phase, items: [], files: [], stepCount: 0 };
      groups.push(target);
    }
    target.items.push(item);
    target.stepCount += item.observation ? 2 : 1;
    const p = stepFilePath(item.step);
    if (p && !target.files.includes(p)) target.files.push(p);
  };

  steps.forEach((step, index) => {
    if (step.type === "thought") {
      // Thoughts lead into the next action — attach them to its phase.
      pendingThoughts.push({ step, index });
      return;
    }
    if (step.type === "observation") {
      const last = groups[groups.length - 1];
      const lastItem = last?.items[last.items.length - 1];
      if (lastItem && lastItem.step.type === "action" && !lastItem.observation) {
        lastItem.observation = step;
        last.stepCount += 1;
        return;
      }
      push(last?.phase ?? "other", { step, index });
      return;
    }
    const phase =
      step.type === "action"
        ? phaseForTool(step.tool)
        : groups[groups.length - 1]?.phase ?? "other"; // done/error join the current phase
    for (const t of pendingThoughts) push(phase, t);
    pendingThoughts = [];
    push(phase, { step, index });
  });
  for (const t of pendingThoughts) push(groups[groups.length - 1]?.phase ?? "other", t);
  return groups;
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const SUGGESTED_TASKS = [
  "Add user authentication with login and signup pages",
  "Create a dashboard with charts and analytics",
  "Add a REST API integration with error handling",
  "Refactor all components to use TypeScript types",
  "Add dark mode support throughout the app",
  "Create a data table with sorting and filtering",
];

export function AgentPanel({ projectId, files, onFilesUpdated, onCreditsChange, credits, isLocked = false }: AgentPanelProps) {
  const [task, setTask] = useState("");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  // Structured Tasks view: section open/closed overrides (key: `${runId}:${groupIdx}`)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [showRawLog, setShowRawLog] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);

  const activeRun = runs.find((r) => r.id === activeRunId);
  const isRunning = activeRun?.status === "running";

  // Tick the elapsed-time readout while a run is in flight
  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isRunning]);

  const groups = useMemo(
    () => (activeRun ? groupSteps(activeRun.steps) : []),
    [activeRun]
  );

  const changedFiles = useMemo(() => {
    const set = new Set<string>();
    for (const s of activeRun?.steps ?? []) {
      if (s.type === "action" && s.tool && EDIT_TOOLS.test(s.tool)) {
        const p = stepFilePath(s);
        if (p) set.add(p);
      }
    }
    return set;
  }, [activeRun]);

  async function startAgent() {
    if (isLocked || !task.trim() || isRunning || credits < 5) return;

    const runId = `run-${Date.now()}`;
    const newRun: AgentRun = { id: runId, task, steps: [], status: "running", startedAt: Date.now() };
    setRuns((prev) => [newRun, ...prev]);
    setActiveRunId(runId);
    setTask("");

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, task, model: DEFAULT_CODING_MODEL }),
        signal: abortRef.current.signal,
      });

      // Surface non-stream rejections explicitly — without this a 423
      // (Live-environment lock, migration 046) or 402 produced a silent
      // no-op run and the user had no idea why nothing changed.
      if (!res.ok) {
        if (res.status === 423) {
          throw new Error(
            "Project is in Live mode — edits are locked. Switch the environment to Test (top bar) to run the agent, then promote to Live when ready."
          );
        }
        if (res.status === 402) {
          throw new Error(`Insufficient credits — agent runs need at least ${AGENT_MIN_CREDITS} credits.`);
        }
        throw new Error(`Agent API error: ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.step) {
              setRuns((prev) => prev.map((r) =>
                r.id === runId
                  ? { ...r, steps: [...r.steps, data.step] }
                  : r
              ));
            }

            if (data.done) {
              setRuns((prev) => prev.map((r) =>
                r.id === runId
                  ? { ...r, status: "done", summary: data.result?.summary, creditsUsed: data.creditsUsed, finishedAt: Date.now() }
                  : r
              ));
              if (data.creditsUsed) onCreditsChange(credits - data.creditsUsed);

              // Refresh files
              const { createClient } = await import("@/lib/supabase/client");
              const supabase = createClient();
              const { data: updatedFiles } = await supabase
                .from("project_files").select("*").eq("project_id", projectId);
              if (updatedFiles) onFilesUpdated(updatedFiles);
            }

            if (data.error) {
              setRuns((prev) => prev.map((r) =>
                r.id === runId ? { ...r, status: "error", summary: data.error, finishedAt: Date.now() } : r
              ));
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setRuns((prev) => prev.map((r) =>
          r.id === runId ? { ...r, status: "error", summary: String(err), finishedAt: Date.now() } : r
        ));
      }
    }
  }

  function stopAgent() {
    abortRef.current?.abort();
    if (activeRunId) {
      setRuns((prev) => prev.map((r) =>
        r.id === activeRunId ? { ...r, status: "error", summary: "Stopped by user", finishedAt: Date.now() } : r
      ));
    }
  }

  function toggleStep(i: number) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleSection(key: string, defaultOpen: boolean) {
    setOpenSections((prev) => ({ ...prev, [key]: !(prev[key] ?? defaultOpen) }));
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold">Agent Mode</div>
          <div className="text-xs text-muted-foreground">Autonomous AI developer</div>
        </div>
        {isRunning && (
          <div className="ml-auto flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse [animation-delay:0.2s]" />
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse [animation-delay:0.4s]" />
            </div>
            <span className="text-xs text-green-400">Running</span>
          </div>
        )}
      </div>

      {/* Active run steps */}
      <div className="flex-1 overflow-y-auto">
        {!activeRun && runs.length === 0 && (
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-brand/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
              <Bot className="w-8 h-8 text-violet-400" />
            </div>
            <h3 className="font-semibold mb-2">Agent Mode</h3>
            <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
              Give the agent a complex task. It will autonomously explore your codebase,
              write code across multiple files, and fix its own errors.
            </p>
            <div className="space-y-2 text-left">
              <p className="text-xs font-medium text-muted-foreground">Try these tasks:</p>
              {SUGGESTED_TASKS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTask(t)}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-muted hover:bg-accent border border-border transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeRun && (
          <div className="p-4 space-y-3">
            {/* Run header — status pill, files changed, elapsed, raw-log toggle */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted/30 text-xs">
              {activeRun.status === "running" ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-700 dark:text-violet-300 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin" /> Running
                </span>
              ) : activeRun.status === "done" ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 font-medium">
                  <CheckCircle className="w-3 h-3" /> Complete
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
                  <AlertCircle className="w-3 h-3" /> Failed
                </span>
              )}
              <span className="flex items-center gap-1 text-muted-foreground">
                <Files className="w-3 h-3" />
                {changedFiles.size} file{changedFiles.size === 1 ? "" : "s"} changed
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatElapsed((activeRun.finishedAt ?? now) - activeRun.startedAt)}
              </span>
              <button
                onClick={() => setShowRawLog((v) => !v)}
                className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
                  showRawLog
                    ? "bg-accent border-border text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
                title="Toggle raw step log"
              >
                <Terminal className="w-3 h-3" /> Raw log
              </button>
            </div>

            {/* Task */}
            <div className="px-3 py-2 rounded-xl bg-muted text-sm">
              <span className="text-xs text-muted-foreground block mb-1">Task</span>
              {activeRun.task}
            </div>

            {/* Structured Tasks view — steps grouped into collapsible phases */}
            {!showRawLog && groups.map((group, gi) => {
              const meta = PHASE_META[group.phase];
              const PhaseIcon = meta.icon;
              const sectionKey = `${activeRun.id}:${gi}:${group.phase}`;
              const isLastGroup = gi === groups.length - 1;
              const defaultOpen = isRunning && isLastGroup;
              const open = openSections[sectionKey] ?? defaultOpen;

              return (
                <motion.div
                  key={sectionKey}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-border bg-muted/30 overflow-hidden"
                >
                  <button
                    onClick={() => toggleSection(sectionKey, defaultOpen)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors"
                  >
                    {open
                      ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <PhaseIcon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
                    <span className="text-xs font-semibold">{meta.label}</span>
                    {isRunning && isLastGroup && (
                      <Loader2 className="w-3 h-3 animate-spin text-violet-400 shrink-0" />
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                      {group.stepCount} step{group.stepCount === 1 ? "" : "s"}
                      {group.files.length > 0 &&
                        ` · ${group.files.length} file${group.files.length === 1 ? "" : "s"}`}
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-border/50 divide-y divide-border/40">
                      {group.items.map(({ step, index, observation }) => {
                        const RowIcon = step.tool
                          ? TOOL_ICONS[step.tool] ?? Wrench
                          : STEP_TYPE_ICONS[step.type] ?? Wrench;
                        const expanded = expandedSteps.has(index);
                        const detail = observation
                          ? `${step.content}\n\n${observation.content}`
                          : step.content;

                        return (
                          <div key={index} className="px-3 py-2">
                            <div
                              className="flex items-start gap-2 cursor-pointer"
                              onClick={() => toggleStep(index)}
                            >
                              <RowIcon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-foreground/90 font-mono truncate">
                                  {stepSummary(step)}
                                </div>
                                {expanded && (
                                  <div className="mt-1.5 text-xs text-foreground/70 font-mono leading-relaxed whitespace-pre-wrap break-words">
                                    {detail}
                                  </div>
                                )}
                              </div>
                              <button className="shrink-0 mt-0.5">
                                {expanded
                                  ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                  : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Raw log — original flat step list, kept for debugging */}
            {showRawLog && activeRun.steps.map((step, i) => {
              const config = STEP_ICONS[step.type];
              const expanded = expandedSteps.has(i);
              const isLong = step.content.length > 100;

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`rounded-xl border p-3 ${config.bg}`}
                >
                  <div
                    className="flex items-start gap-2 cursor-pointer"
                    onClick={() => isLong && toggleStep(i)}
                  >
                    <span className="text-sm shrink-0 mt-0.5">{config.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold uppercase tracking-wider mb-1 ${config.color}`}>
                        {step.type}
                        {step.tool && ` → ${step.tool}`}
                      </div>
                      <div className={`text-xs text-foreground/80 font-mono leading-relaxed ${!expanded && isLong ? "line-clamp-3" : ""}`}>
                        {step.content}
                      </div>
                    </div>
                    {isLong && (
                      <button className="shrink-0 mt-0.5">
                        {expanded
                          ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {/* Running indicator */}
            {isRunning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                <span className="text-xs text-muted-foreground">Agent is thinking...</span>
              </motion.div>
            )}

            {/* Done/Error summary */}
            {activeRun.status !== "running" && activeRun.summary && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border p-3 ${
                  activeRun.status === "done"
                    ? "bg-green-500/10 border-green-500/20"
                    : "bg-red-500/10 border-red-500/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {activeRun.status === "done"
                    ? <CheckCircle className="w-4 h-4 text-green-400" />
                    : <AlertCircle className="w-4 h-4 text-red-400" />}
                  <span className="text-xs font-semibold">
                    {activeRun.status === "done" ? "Completed" : "Stopped"}
                    {activeRun.creditsUsed && ` · ${activeRun.creditsUsed} credits used`}
                  </span>
                </div>
                <p className="text-xs text-foreground/80">{activeRun.summary}</p>
              </motion.div>
            )}
          </div>
        )}

        {/* Previous runs */}
        {runs.length > 1 && (
          <div className="px-4 pb-4">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Previous runs</p>
            <div className="space-y-2">
              {runs.slice(1).map((run) => (
                <button
                  key={run.id}
                  onClick={() => setActiveRunId(run.id)}
                  className={`block w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                    activeRunId === run.id ? "bg-accent border-border" : "bg-muted/30 border-border/50 hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {run.status === "done" ? (
                      <CheckCircle className="w-3 h-3 text-green-400" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-red-400" />
                    )}
                    <span className="font-medium truncate">{run.task}</span>
                  </div>
                  <span className="text-muted-foreground">{run.steps.length} steps</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0">
        {isLocked && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span><span className="font-semibold">Live environment</span> — agent runs are locked. Switch to Test in the top bar.</span>
          </div>
        )}
        {credits < 5 && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Agent requires 5+ credits. You have {credits}.
          </div>
        )}
        <div className="relative flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-2.5">
          <Textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe a complex task for the agent to complete autonomously..."
            className="min-h-[80px] max-h-40 resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 placeholder:text-muted-foreground"
            disabled={isRunning || isLocked}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) startAgent();
            }}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="w-3 h-3 text-yellow-400" />
              <span>5–20 credits · Ctrl+Enter to run</span>
            </div>
            {isRunning ? (
              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={stopAgent}>
                <Square className="w-3 h-3" /> Stop
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90"
                onClick={startAgent}
                disabled={!task.trim() || credits < 5 || isLocked}
              >
                <Bot className="w-3 h-3" /> Run Agent
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
