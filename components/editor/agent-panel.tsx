"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Zap, ChevronDown, ChevronRight, Square,
  CheckCircle, AlertCircle, Eye, Code2, Loader2, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentStep } from "@/lib/ai/agent";
import { DEFAULT_CODING_MODEL } from "@/lib/ai/model-defaults";
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
}

const STEP_ICONS = {
  thought: { icon: "💭", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  action: { icon: "⚡", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  observation: { icon: "👁️", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  done: { icon: "✅", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  error: { icon: "❌", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
};

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
  const abortRef = useRef<AbortController | null>(null);

  const activeRun = runs.find((r) => r.id === activeRunId);
  const isRunning = activeRun?.status === "running";

  async function startAgent() {
    if (isLocked || !task.trim() || isRunning || credits < 5) return;

    const runId = `run-${Date.now()}`;
    const newRun: AgentRun = { id: runId, task, steps: [], status: "running" };
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
                  ? { ...r, status: "done", summary: data.result?.summary, creditsUsed: data.creditsUsed }
                  : r
              ));
              if (data.creditsUsed) onCreditsChange(credits - data.creditsUsed);

              // Refresh files
              const { createClient } = await import("@/lib/supabase/client");
              const supabase = createClient();
              const { data: updatedFiles } = await (supabase as any)
                .from("project_files").select("*").eq("project_id", projectId);
              if (updatedFiles) onFilesUpdated(updatedFiles);
            }

            if (data.error) {
              setRuns((prev) => prev.map((r) =>
                r.id === runId ? { ...r, status: "error", summary: data.error } : r
              ));
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setRuns((prev) => prev.map((r) =>
          r.id === runId ? { ...r, status: "error", summary: String(err) } : r
        ));
      }
    }
  }

  function stopAgent() {
    abortRef.current?.abort();
    if (activeRunId) {
      setRuns((prev) => prev.map((r) =>
        r.id === activeRunId ? { ...r, status: "error", summary: "Stopped by user" } : r
      ));
    }
  }

  function toggleStep(i: number) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
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
            {/* Task */}
            <div className="px-3 py-2 rounded-xl bg-muted text-sm">
              <span className="text-xs text-muted-foreground block mb-1">Task</span>
              {activeRun.task}
            </div>

            {/* Steps */}
            {activeRun.steps.map((step, i) => {
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
          <div className="mb-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
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
