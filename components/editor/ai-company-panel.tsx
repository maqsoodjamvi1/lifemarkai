"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  Users,
  Hammer,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompanyAgent {
  id: string;
  role: string;
  name: string;
  title: string;
  responsibilities: string[];
  status: "idle" | "thinking" | "blocked" | "reviewing" | "done";
}

interface CompanyMessage {
  id: string;
  content: string;
  phase: string;
  created_at: string;
  agent?: { name?: string | null; role?: string | null } | null;
}

interface CompanyDecision {
  id: string;
  title: string;
  summary: string;
  status: string;
  created_at: string;
  agent?: { name?: string | null; role?: string | null } | null;
}

interface CompanyState {
  agents: CompanyAgent[];
  messages: CompanyMessage[];
  decisions: CompanyDecision[];
}

interface AiCompanyPanelProps {
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

export function AiCompanyPanel({ projectId, onSendPromptToChat }: AiCompanyPanelProps) {
  const [state, setState] = useState<CompanyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadCompany() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-company`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load AI company");
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

  async function bootstrapCompany() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bootstrap" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not bootstrap AI company");
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

  const [buildGoal, setBuildGoal] = useState("");
  const [building, setBuilding] = useState(false);
  const [buildLog, setBuildLog] = useState<string[]>([]);

  async function runBuild() {
    const goal = buildGoal.trim();
    if (!goal || building) return;
    setBuilding(true);
    setBuildLog([]);
    const log = (line: string) => setBuildLog((prev) => [...prev.slice(-120), line]);
    try {
      const res = await fetch("/api/titan/initiative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The company roster is already bootstrapped here, so don't re-seed.
        body: JSON.stringify({ projectId, goal, seedAgents: false }),
      });
      if (!res.ok || !res.body) {
        log(`Build failed (${res.status}). ${(await res.text().catch(() => "")).slice(0, 200)}`);
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
          switch (ev.type) {
            case "initiative_status": log(`• ${ev.status}`); break;
            case "agent_status": log(`${ev.role}: ${ev.state}${ev.summary ? ` — ${ev.summary}` : ""}`); break;
            case "plan": log(`Plan ready (${(ev.epics as unknown[] ?? []).length} epics)`); break;
            case "debate_status": log(`Debating: ${ev.topic} (round ${ev.round})`); break;
            case "decision": log(`Decision (${ev.decidedBy}): ${ev.topic}`); break;
            case "file_change": log(`✎ ${ev.path}`); break;
            case "verify_status": log(ev.ok ? "Verification passed" : "Verification found issues"); break;
            case "error": log(`⚠ ${ev.message}`); break;
            case "done": log(`Done — ${(ev.filesChanged as unknown[] ?? []).length} files, ${Number(ev.creditsUsed ?? 0)} credits`); break;
          }
        }
      }
      await loadCompany(); // refresh roster/discussion/decisions from the shared tables
    } catch (err) {
      log(err instanceof Error ? err.message : "Build failed");
    } finally {
      setBuilding(false);
    }
  }

  useEffect(() => {
    void loadCompany();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const discoveryPrompt = useMemo(() => {
    const agents = state?.agents.map((agent) => `- ${agent.name}: ${agent.title}`).join("\n") ?? "";
    return `Run PROJECT TITAN AI Software Company discovery for this project.

Use these role agents as an internal review board:
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

Then identify the smallest safe implementation slice and build it using existing LifemarkAI project patterns.`;
  }, [state?.agents]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10">
          <BriefcaseBusiness className="h-4 w-4 text-violet-300" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">AI Software Company</div>
          <div className="text-xs text-muted-foreground">Persistent Titan role agents for this project</div>
        </div>
        <Button size="sm" variant="ghost" className="ml-auto h-8 px-2" onClick={loadCompany} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading company agents...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && state && (
          <div className="space-y-5">
            {state.agents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-5 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10">
                  <BriefcaseBusiness className="h-5 w-5 text-violet-300" />
                </div>
                <p className="text-sm font-medium">No company agents yet</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                  Bootstrap the Titan role team for this project. This creates persistent agents,
                  kickoff discussion, and memory records.
                </p>
                <Button className="mt-4 h-8" size="sm" onClick={bootstrapCompany}>
                  Bootstrap AI Company
                </Button>
              </div>
            ) : (
              <>
                <section>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    Role Agents
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
                          {message.agent?.name ?? "Company"} - {message.phase}
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
              </>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        {/* Live build log */}
        {(building || buildLog.length > 0) && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2 text-[11px] font-mono leading-relaxed">
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

        {/* Build with the company — runs the orchestrator (agents actually build) */}
        <textarea
          value={buildGoal}
          onChange={(e) => setBuildGoal(e.target.value)}
          placeholder="What should the company build? e.g. 'add a checkout flow with Stripe'"
          rows={2}
          disabled={building}
          className="w-full resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs outline-none focus:border-violet-500/50"
        />
        <Button
          className="h-9 w-full gap-2"
          onClick={() => void runBuild()}
          disabled={!buildGoal.trim() || building || !state || state.agents.length === 0}
        >
          {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />}
          {building ? "Building…" : "Build with the Company"}
        </Button>

        <Button
          variant="outline"
          className="h-8 w-full gap-2"
          onClick={() => onSendPromptToChat(discoveryPrompt)}
          disabled={!state || loading || state.agents.length === 0}
        >
          <Send className="h-3.5 w-3.5" />
          Run Company Discovery
        </Button>
      </div>
    </div>
  );
}
