"use client";

/**
 * Editor Intelligence Console (roadmap P1).
 *
 * A real console over the multi-lens orchestrator:
 *   - Team    → live role cards driven by `agent_status` events
 *   - Plan    → epics → tasks tree (`plan`), statuses (`task_status`), waves (`wave_start`)
 *   - Debate  → threaded `agent_message` / `debate_status` / `decision` feed
 *   - Memory  → persisted roster, discussion, and decisions (migration-068 tables)
 * plus a run footer (`file_change` / `verify_status` / `done` / `error`), gate
 * approval cards (`gate`), a collapsible raw log, and resume/replay of durable
 * runs via GET /api/editor-intelligence/initiative/[id].
 *
 * View subcomponents + the event reducer live in editor-intelligence-console.tsx.
 */

import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  History,
  Hammer,
  ListTree,
  Loader2,
  MessageSquare,
  MessagesSquare,
  Send,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyConsoleEvent,
  DebateFeed,
  GateApprovalCard,
  initialConsoleState,
  PlanTree,
  RunFooter,
  TeamGrid,
  type ConsoleState,
  type GateInfo,
} from "./editor-intelligence-console";

interface IntelligenceLens {
  id: string;
  role: string;
  name: string;
  title: string;
  responsibilities: string[];
  status: "idle" | "thinking" | "blocked" | "reviewing" | "done";
}

interface IntelligenceMessage {
  id: string;
  content: string;
  phase: string;
  created_at: string;
  agent?: { name?: string | null; role?: string | null } | null;
}

interface IntelligenceDecision {
  id: string;
  title: string;
  summary: string;
  status: string;
  created_at: string;
  agent?: { name?: string | null; role?: string | null } | null;
}

interface IntelligenceState {
  agents: IntelligenceLens[];
  messages: IntelligenceMessage[];
  decisions: IntelligenceDecision[];
}

interface EditorIntelligencePanelProps {
  projectId: string;
  onSendPromptToChat: (prompt: string) => void;
}

const ROLE_COLORS: Record<string, string> = {
  product_manager: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  technical_architect: "border-violet-500/25 bg-violet-500/10 text-violet-300",
  ui_designer: "border-pink-500/25 bg-pink-500/10 text-pink-300",
  frontend_engineer: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  backend_engineer: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  database_engineer: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  devops_engineer: "border-orange-500/25 bg-orange-500/10 text-orange-300",
  qa_engineer: "border-lime-500/25 bg-lime-500/10 text-lime-300",
  security_engineer: "border-red-500/25 bg-red-500/10 text-red-300",
  business_analyst: "border-blue-500/25 bg-blue-500/10 text-blue-300",
};

const CONSOLE_TABS = [
  { id: "team", label: "Team", icon: Users },
  { id: "plan", label: "Plan", icon: ListTree },
  { id: "debate", label: "Debate", icon: MessagesSquare },
  { id: "memory", label: "Memory", icon: History },
] as const;

type ConsoleTab = (typeof CONSOLE_TABS)[number]["id"];

/** One human-readable raw-log line per streamed event (null = don't log). */
function formatLogLine(ev: Record<string, unknown>): string | null {
  switch (ev.type) {
    case "initiative_run":
      return `${ev.resumed ? "Resumed" : "Started"} durable run ${typeof ev.initiativeId === "string" ? ev.initiativeId.slice(0, 8) : ""}`;
    case "initiative_status": return `• ${ev.status}`;
    case "agent_status": return `${ev.role}: ${ev.state}${ev.summary ? ` — ${ev.summary}` : ""}`;
    case "plan": return `Plan ready (${(ev.epics as unknown[] ?? []).length} epics)`;
    case "debate_status": return `Debating: ${ev.topic} (round ${ev.round})`;
    case "agent_message": return `${ev.from}${ev.to ? ` → ${ev.to}` : ""} [${ev.channel}]: ${String(ev.content ?? "").slice(0, 140)}`;
    case "decision": return `Decision (${ev.decidedBy}): ${ev.topic}`;
    case "wave_start": return `Wave ${ev.wave} — ${(ev.taskIds as unknown[] ?? []).length} task(s)`;
    case "task_status": return `Task ${String(ev.taskId ?? "").slice(0, 8)} (${ev.role}): ${ev.status}`;
    case "file_change": return `✎ ${ev.path}`;
    case "gate": return `⚠ Gate: ${ev.kind}${ev.needsApproval ? " — approval needed" : ""}`;
    case "verify_status": return ev.ok ? "Verification passed" : "Verification found issues";
    case "error": return `⚠ ${ev.message}`;
    case "done":
      return `Done — ${(ev.filesChanged as unknown[] ?? []).length} files, ${Number(ev.creditsUsed ?? 0)} credits`;
    default: return null;
  }
}

export function EditorIntelligencePanel({ projectId, onSendPromptToChat }: EditorIntelligencePanelProps) {
  const [state, setState] = useState<IntelligenceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<ConsoleTab>("team");
  const [consoleState, setConsoleState] = useState<ConsoleState>(initialConsoleState());
  const [logOpen, setLogOpen] = useState(false);

  const [buildGoal, setBuildGoal] = useState("");
  const [building, setBuilding] = useState(false);
  const [buildLog, setBuildLog] = useState<string[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);

  const runKey = `lifemark:editor-intelligence:${projectId}:run`;

  async function loadIntelligence() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/editor-intelligence`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load editor intelligence");
      setState({
        agents: data.agents ?? [],
        messages: data.messages ?? [],
        decisions: data.decisions ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function bootstrapIntelligence() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/editor-intelligence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bootstrap" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not initialize editor intelligence");
      setState({
        agents: data.agents ?? [],
        messages: data.messages ?? [],
        decisions: data.decisions ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  /** Ingest one event into the console state + raw log. */
  function ingestEvent(ev: Record<string, unknown>) {
    setConsoleState((prev) => applyConsoleEvent(prev, ev));
    const line = formatLogLine(ev);
    if (line) setBuildLog((prev) => [...prev.slice(-200), line]);
    if (ev.type === "initiative_run" && typeof ev.initiativeId === "string") {
      setActiveRunId(ev.initiativeId);
      localStorage.setItem(runKey, ev.initiativeId);
    }
    if (ev.type === "done") {
      localStorage.removeItem(runKey);
      setActiveRunId(null);
    }
  }

  /**
   * Start (or resume) an initiative and stream its events into the console.
   *
   * `autonomy` is sent when the user approves a gate. There is no dedicated
   * gate-approval endpoint, so Approve re-POSTs the initiative with the
   * saved runId (the route resumes from the durable checkpoint) plus an
   * `autonomy` override matching AutonomyGates in lib/ai/editor-lenses/types.ts
   * (e.g. { spend: "unlimited" } or { database: "allow" }). The route
   * sanitizes and forwards the override to runInitiative (liveEnv can never
   * be overridden), so approving a gate genuinely unblocks the paused run.
   */
  async function runBuild(resumeRunId?: string, autonomy?: Record<string, string>) {
    const goal = buildGoal.trim() || (resumeRunId ? "Resume editor intelligence run" : "");
    if (!goal || building) return;
    setBuilding(true);
    if (!resumeRunId) {
      setBuildLog([]);
      setConsoleState(initialConsoleState());
    } else {
      // Clear a pending gate — the resumed stream re-emits it if still blocked.
      setConsoleState((prev) => ({ ...prev, gate: null, error: null }));
    }
    try {
      const res = await fetch("/api/editor-intelligence/initiative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The lens roster is already bootstrapped here, so don't re-seed.
        body: JSON.stringify({ projectId, goal, runId: resumeRunId, seedAgents: false, autonomy }),
      });
      if (!res.ok || !res.body) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        setBuildLog((prev) => [...prev, `Build failed (${res.status}). ${detail}`]);
        setConsoleState((prev) => ({ ...prev, error: `Build failed (${res.status})` }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const dl = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!dl) continue;
          let ev: Record<string, unknown>;
          try { ev = JSON.parse(dl.slice(6)); } catch { continue; }
          ingestEvent(ev);
        }
      }
      await loadIntelligence(); // refresh roster/discussion/decisions from the shared tables
    } catch (err) {
      const message = err instanceof Error ? err.message : "Build failed";
      setBuildLog((prev) => [...prev, `⚠ ${message}`]);
      setConsoleState((prev) => ({ ...prev, error: message }));
    } finally {
      setBuilding(false);
    }
  }

  /**
   * Replay a durable run's event history (GET /api/editor-intelligence/
   * initiative/[id] → { run, events }; each event row carries the original
   * streamed event in `payload`). Rebuilds the whole console read-only.
   */
  async function replayRun(runId: string, opts: { silent?: boolean } = {}) {
    setReplaying(true);
    try {
      const res = await fetch(`/api/editor-intelligence/initiative/${runId}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 404) {
          localStorage.removeItem(runKey);
          setActiveRunId(null);
        }
        if (!opts.silent) setBuildLog((prev) => [...prev, `Replay failed (${res.status})`]);
        return;
      }
      const data = await res.json() as {
        run?: { id?: string; status?: string; goal?: string } | null;
        events?: Array<{ payload?: Record<string, unknown> } & Record<string, unknown>>;
      };
      let next = initialConsoleState();
      const lines: string[] = [];
      for (const row of data.events ?? []) {
        const ev = (row.payload && typeof row.payload === "object" ? row.payload : row) as Record<string, unknown>;
        next = applyConsoleEvent(next, ev);
        const line = formatLogLine(ev);
        if (line) lines.push(line);
      }
      setConsoleState(next);
      setBuildLog(lines.slice(-200));
      const status = data.run?.status;
      if (status === "done" || status === "failed") {
        localStorage.removeItem(runKey);
        setActiveRunId(null);
      } else {
        setActiveRunId(runId);
        if (!buildGoal && data.run?.goal) setBuildGoal(data.run.goal);
      }
    } catch {
      if (!opts.silent) setBuildLog((prev) => [...prev, "Replay failed"]);
    } finally {
      setReplaying(false);
    }
  }

  function approveGate(gate: GateInfo) {
    const runId = consoleState.runId ?? activeRunId;
    if (!runId) return;
    // AutonomyGates (types.ts): spend is "budget" | "unlimited"; database/deploy
    // are "never" | "ask" | "allow". See runBuild() docblock for the caveat.
    const override = gate.kind === "spend" ? { spend: "unlimited" } : { [gate.kind]: "allow" };
    void runBuild(runId, override);
  }

  function denyGate() {
    // Keep the run resumable; just dismiss the card and stop here.
    setConsoleState((prev) => ({ ...prev, gate: null }));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadIntelligence();
    const storedRunId = localStorage.getItem(runKey);
    if (storedRunId) {
      setActiveRunId(storedRunId);
      // Repopulate the console from the durable event history on mount.
      void replayRun(storedRunId, { silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const discoveryPrompt = useMemo(() => {
    const agents = state?.agents.map((agent) => `- ${agent.name}: ${agent.title}`).join("\n") ?? "";
    return `Run LifemarkAI Editor Intelligence review for this project.

Use these internal LifemarkAI lenses as one editor brain:
${agents}

Produce a concise but complete implementation brief with:
1. Product discovery: market, competitors, personas, user stories, business model.
2. Technical architecture: frontend, backend, database, integrations, deployment.
3. UI plan: screens, components, responsive states, accessibility.
4. Database plan: ERD summary, tables, RLS, indexes, migrations.
5. API plan: REST/GraphQL/webhook/event contracts as needed.
6. QA plan: unit, integration, E2E, load, and acceptance tests.
7. Security plan: threat model, secrets, auth, RLS, dependency risks.
8. Roadmap: MVP, beta, production, scale phases.

Then identify the smallest safe implementation slice and build it using existing LifemarkAI project patterns. Do not expose this as a separate module or workflow.`;
  }, [state?.agents]);

  const initialized = !!state && state.agents.length > 0;
  const pendingGate = consoleState.gate?.needsApproval ? consoleState.gate : null;

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10">
          <BriefcaseBusiness className="h-4 w-4 text-violet-300" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Editor Intelligence</div>
          <div className="text-xs text-muted-foreground">Internal LifemarkAI lenses for stronger vibe coding</div>
        </div>
        <Button size="sm" variant="ghost" className="ml-auto h-8 px-2" onClick={loadIntelligence} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      {/* Console tab bar (matches lifemark-cloud-panel.tsx conventions) */}
      {initialized && (
        <div className="flex border-b border-border shrink-0 overflow-x-auto">
          {CONSOLE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-violet-500 text-violet-300"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading && !state && (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading editor intelligence...
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && state && !initialized && (
          <div className="rounded-lg border border-dashed border-border p-5 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10">
              <BriefcaseBusiness className="h-5 w-5 text-violet-300" />
            </div>
            <p className="text-sm font-medium">Editor intelligence is not initialized yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Initialize the internal LifemarkAI lenses for this project. They keep context,
              decisions, and review notes that make build/debug work sharper.
            </p>
            <Button className="mt-4 h-8" size="sm" onClick={bootstrapIntelligence}>
              Initialize Intelligence
            </Button>
          </div>
        )}

        {state && initialized && (
          <>
            {replaying && (
              <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Replaying run history…
              </div>
            )}

            {tab === "team" && <TeamGrid state={consoleState} />}
            {tab === "plan" && <PlanTree state={consoleState} />}
            {tab === "debate" && <DebateFeed state={consoleState} />}
            {tab === "memory" && (
              <MemoryView state={state} />
            )}
          </>
        )}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        {/* Gate approval — the run is paused at a durable checkpoint */}
        {pendingGate && (
          <GateApprovalCard
            gate={pendingGate}
            busy={building}
            onApprove={() => approveGate(pendingGate)}
            onDeny={denyGate}
          />
        )}

        {/* Run footer: files changed, verification, credits, error banner */}
        <RunFooter state={consoleState} building={building} />

        {/* Collapsible raw event log */}
        {(building || buildLog.length > 0) && (
          <div className="rounded-lg border border-border bg-muted/20">
            <button
              onClick={() => setLogOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {logOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Log ({buildLog.length})
              {building && <Loader2 className="ml-auto h-3 w-3 animate-spin text-violet-300" />}
            </button>
            {logOpen && (
              <div className="max-h-40 overflow-y-auto border-t border-border p-2 text-[11px] font-mono leading-relaxed">
                {buildLog.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.startsWith("✎") ? "text-emerald-400"
                      : l.startsWith("⚠") ? "text-red-400"
                      : l.startsWith("Decision") ? "text-amber-400"
                      : l.startsWith("Done") ? "text-emerald-400 font-medium"
                      : "text-muted-foreground"
                    }
                  >
                    {l}
                  </div>
                ))}
                {building && <div className="text-violet-300"><Loader2 className="inline h-3 w-3 animate-spin mr-1" />working…</div>}
              </div>
            )}
          </div>
        )}

        {/* Build with editor intelligence — runs the internal orchestrator */}
        <textarea
          value={buildGoal}
          onChange={(e) => setBuildGoal(e.target.value)}
          placeholder="What should LifemarkAI build or debug? e.g. 'add a checkout flow with Stripe'"
          rows={2}
          disabled={building}
          className="w-full resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs outline-none focus:border-violet-500/50"
        />
        <Button
          className="h-9 w-full gap-2"
          onClick={() => void runBuild()}
          disabled={!buildGoal.trim() || building || !initialized}
        >
          {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />}
          {building ? "Building…" : "Build with Intelligence"}
        </Button>

        {activeRunId && !building && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="h-8 flex-1 gap-2"
              onClick={() => void runBuild(activeRunId)}
              disabled={!initialized}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Resume run
            </Button>
            <Button
              variant="outline"
              className="h-8 flex-1 gap-2"
              onClick={() => void replayRun(activeRunId)}
              disabled={replaying}
            >
              <History className="h-3.5 w-3.5" />
              Replay history
            </Button>
          </div>
        )}

        <Button
          variant="outline"
          className="h-8 w-full gap-2"
          onClick={() => onSendPromptToChat(discoveryPrompt)}
          disabled={!initialized || loading}
        >
          <Send className="h-3.5 w-3.5" />
          Run Intelligence Review
        </Button>
      </div>
    </div>
  );
}

/* ── Memory tab: persisted roster + discussion + decisions (pre-console UI) ── */

function MemoryView({ state }: { state: IntelligenceState }) {
  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Intelligence Lenses
        </div>
        <div className="grid grid-cols-1 gap-2">
          {state.agents.map((agent) => (
            <div key={agent.id} className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2 flex items-start gap-2">
                <div className={`rounded-md border px-2 py-1 text-[11px] font-medium ${ROLE_COLORS[agent.role] ?? "border-border bg-muted text-muted-foreground"}`}>
                  {agent.name}
                </div>
                <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3" />
                  {agent.status}
                </div>
              </div>
              <p className="text-xs font-medium text-foreground">{agent.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {agent.responsibilities.slice(0, 2).join(" - ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          Discussion
        </div>
        <div className="space-y-2">
          {state.messages.slice(0, 8).map((message) => (
            <div key={message.id} className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-1 text-[11px] font-medium text-violet-300">
                {message.agent?.name ?? "LifemarkAI"} - {message.phase}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{message.content}</p>
            </div>
          ))}
          {state.messages.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No discussion yet.
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Decisions</div>
        <div className="space-y-2">
          {state.decisions.slice(0, 5).map((decision) => (
            <div key={decision.id} className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{decision.title}</p>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                  {decision.status}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{decision.summary}</p>
            </div>
          ))}
          {state.decisions.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No architecture or product decisions recorded yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
