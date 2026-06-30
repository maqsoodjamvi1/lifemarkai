import type { AutoWireResult } from "@/lib/cloud/auto-wire";
import type { SelfVerifyResult } from "@/lib/ai/self-verify";
import {
  EDITOR_LENS_DEFINITIONS,
  type EditorLensRole,
  buildEditorLensSeed,
} from "@/lib/ai/editor-lenses/persistent-lenses";
import type { AgentRoleId } from "@/lib/ai/editor-lenses/types";
import type { EditorIntelligenceEvent, InitiativeCheckpoint } from "@/lib/ai/editor-lenses/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export type InitiativeStatus =
  | "queued"
  | "planning"
  | "debating"
  | "executing"
  | "verifying"
  | "paused"
  | "done"
  | "failed";

export interface PersistedInitiativeRun {
  id: string;
  project_id: string;
  user_id?: string | null;
  goal: string;
  status: InitiativeStatus;
  budget_credits?: number | null;
  credits_used?: number | null;
  checkpoint?: InitiativeCheckpoint | null;
  result?: unknown;
  error?: string | null;
}

export const PERSISTED_ROLE_BY_LENS: Record<AgentRoleId, EditorLensRole | "cto"> = {
  pm: "product_manager",
  ba: "business_analyst",
  architect: "technical_architect",
  designer: "ui_designer",
  frontend: "frontend_engineer",
  backend: "backend_engineer",
  database: "database_engineer",
  devops: "devops_engineer",
  qa: "qa_engineer",
  security: "security_engineer",
  cto: "cto",
};

const KICKOFF_MESSAGES: Array<{ role: EditorLensRole; content: string }> = [
  {
    role: "product_manager",
    content:
      "Kickoff: I will convert the user's goal into LifemarkAI build intent, release slices, acceptance criteria, and a roadmap before implementation.",
  },
  {
    role: "technical_architect",
    content:
      "Architecture review starts with module boundaries, data ownership, integration risks, and deployment constraints inside the editor build.",
  },
  {
    role: "ui_designer",
    content:
      "Design review will define the primary workflows, responsive layout, empty states, and visual consistency requirements for the generated app.",
  },
  {
    role: "qa_engineer",
    content:
      "QA will track acceptance checks, regression risks, and the test plan for each editor build slice.",
  },
  {
    role: "security_engineer",
    content:
      "Security will review auth, authorization, RLS, secrets, generated APIs, and dependency risk before launch.",
  },
];

function short(text: string, max = 420): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function roleLabel(role?: string | null): string {
  return role?.replace(/_/g, " ") ?? "editor lens";
}

function statusFromEvent(event: EditorIntelligenceEvent): InitiativeStatus | null {
  if (event.type === "initiative_status") {
    if (event.status === "planning") return "planning";
    if (event.status === "debating") return "debating";
    if (event.status === "executing") return "executing";
    if (event.status === "done") return "done";
    if (event.status === "resuming") return "executing";
  }
  if (event.type === "verify_status") return "verifying";
  if (event.type === "gate") return "paused";
  if (event.type === "error") return "failed";
  if (event.type === "done") return "done";
  return null;
}

async function agentIdByRole(supabase: SupabaseClient, projectId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("project_ai_agents")
    .select("id, role")
    .eq("project_id", projectId);
  return new Map(
    ((data ?? []) as Array<{ id: string; role: string }>).map((agent) => [agent.role, agent.id]),
  );
}

export async function ensureEditorLensRoster(
  supabase: SupabaseClient,
  projectId: string,
  projectName = "Untitled project",
  opts: { seedKickoff?: boolean } = {},
) {
  const { data: existing, error: existingError } = await supabase
    .from("project_ai_agents")
    .select("role")
    .eq("project_id", projectId);
  if (existingError) throw new Error(`Could not load editor intelligence lenses: ${existingError.message}`);

  const existingRoles = new Set(((existing ?? []) as Array<{ role: string }>).map((agent) => agent.role));
  const missing = buildEditorLensSeed(projectName)
    .filter((agent) => !existingRoles.has(agent.role))
    .map((agent) => ({ project_id: projectId, ...agent }));

  if (missing.length > 0) {
    const { error: upsertError } = await supabase
      .from("project_ai_agents")
      .upsert(missing, { onConflict: "project_id,role" });
    if (upsertError) throw new Error(`Could not create editor intelligence lenses: ${upsertError.message}`);
  }

  const { data: agents, error: agentsError } = await supabase
    .from("project_ai_agents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (agentsError) throw new Error(`Could not reload editor intelligence lenses: ${agentsError.message}`);

  if (opts.seedKickoff !== false) {
    const { count, error: countError } = await supabase
      .from("project_ai_agent_messages")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (countError) throw new Error(`Could not inspect intelligence discussion: ${countError.message}`);

    if ((count ?? 0) === 0 && agents?.length) {
      const byRole = new Map(
        (agents as Array<{ id: string; role: string }>).map((agent) => [agent.role, agent.id]),
      );
      const kickoffRows = KICKOFF_MESSAGES.map((message) => ({
        project_id: projectId,
        agent_id: byRole.get(message.role) ?? null,
        phase: "kickoff",
        content: message.content,
        metadata: { source: "bootstrap" },
      }));
      const { error: kickoffError } = await supabase
        .from("project_ai_agent_messages")
        .insert(kickoffRows);
      if (kickoffError) throw new Error(`Could not seed kickoff discussion: ${kickoffError.message}`);
    }
  }

  return agents ?? [];
}

export async function loadEditorIntelligenceState(supabase: SupabaseClient, projectId: string) {
  const [agentsRes, messagesRes, decisionsRes] = await Promise.all([
    supabase
      .from("project_ai_agents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_ai_agent_messages")
      .select("*, agent:project_ai_agents(id, role, name)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("project_ai_agent_decisions")
      .select("*, agent:project_ai_agents(id, role, name)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (agentsRes.error) throw new Error(`Could not load editor intelligence lenses: ${agentsRes.error.message}`);
  if (messagesRes.error) throw new Error(`Could not load intelligence discussion: ${messagesRes.error.message}`);
  if (decisionsRes.error) throw new Error(`Could not load intelligence decisions: ${decisionsRes.error.message}`);

  return {
    agents: agentsRes.data ?? [],
    messages: messagesRes.data ?? [],
    decisions: decisionsRes.data ?? [],
    roles: EDITOR_LENS_DEFINITIONS,
  };
}

export async function createEditorInitiativeRun(opts: {
  supabase: SupabaseClient;
  projectId: string;
  userId: string;
  goal: string;
  budgetCredits?: number | null;
}): Promise<PersistedInitiativeRun> {
  const { data, error } = await opts.supabase
    .from("project_ai_initiatives")
    .insert({
      project_id: opts.projectId,
      user_id: opts.userId,
      goal: opts.goal,
      status: "queued",
      budget_credits: opts.budgetCredits ?? null,
      checkpoint: {},
    })
    .select("*")
    .single();
  if (error) throw new Error(`Could not create initiative run: ${error.message}`);
  return data as PersistedInitiativeRun;
}

export async function loadEditorInitiativeRun(
  supabase: SupabaseClient,
  initiativeId: string,
): Promise<PersistedInitiativeRun | null> {
  const { data, error } = await supabase
    .from("project_ai_initiatives")
    .select("*")
    .eq("id", initiativeId)
    .maybeSingle();
  if (error) throw new Error(`Could not load initiative run: ${error.message}`);
  return (data ?? null) as PersistedInitiativeRun | null;
}

export async function loadEditorInitiativeEvents(supabase: SupabaseClient, initiativeId: string) {
  const { data, error } = await supabase
    .from("project_ai_initiative_events")
    .select("*")
    .eq("initiative_id", initiativeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load initiative events: ${error.message}`);
  return data ?? [];
}

export async function appendEditorInitiativeEvent(opts: {
  supabase: SupabaseClient;
  initiativeId: string;
  projectId: string;
  event: EditorIntelligenceEvent | Record<string, unknown>;
}) {
  const payload = opts.event as Record<string, unknown>;
  const eventType = typeof payload.type === "string" ? payload.type : "event";
  await opts.supabase.from("project_ai_initiative_events").insert({
    initiative_id: opts.initiativeId,
    project_id: opts.projectId,
    type: eventType,
    payload: opts.event,
  });

  const status = statusFromEvent(opts.event as EditorIntelligenceEvent);
  const update: Record<string, unknown> = { last_event_at: new Date().toISOString() };
  if (status) update.status = status;
  if (eventType === "done") {
    update.result = opts.event;
    update.credits_used = typeof payload.creditsUsed === "number" ? payload.creditsUsed : 0;
  }
  if (eventType === "error" && typeof payload.message === "string") update.error = payload.message;

  await opts.supabase
    .from("project_ai_initiatives")
    .update(update)
    .eq("id", opts.initiativeId);
}

export async function updateEditorInitiativeCheckpoint(opts: {
  supabase: SupabaseClient;
  initiativeId: string;
  checkpoint: InitiativeCheckpoint;
}) {
  const status = opts.checkpoint.phase === "done"
    ? "done"
    : opts.checkpoint.phase === "verifying"
      ? "verifying"
      : opts.checkpoint.phase === "debating"
        ? "debating"
        : opts.checkpoint.phase === "executing"
          ? "executing"
          : "planning";

  await opts.supabase
    .from("project_ai_initiatives")
    .update({
      status,
      checkpoint: opts.checkpoint,
      credits_used: opts.checkpoint.creditsUsed ?? 0,
      last_event_at: new Date().toISOString(),
    })
    .eq("id", opts.initiativeId);
}

export async function failEditorInitiativeRun(opts: {
  supabase: SupabaseClient;
  initiativeId: string;
  error: string;
}) {
  await opts.supabase
    .from("project_ai_initiatives")
    .update({
      status: "failed",
      error: opts.error,
      last_event_at: new Date().toISOString(),
    })
    .eq("id", opts.initiativeId);
}

export async function insertEditorLensMessage(opts: {
  supabase: SupabaseClient;
  projectId: string;
  role: string;
  phase: string;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const { supabase, projectId, role, phase, content, metadata } = opts;
  const byRole = await agentIdByRole(supabase, projectId);
  if (!byRole.has(role)) throw new Error(`Unknown intelligence lens: ${role}`);
  const { error } = await supabase.from("project_ai_agent_messages").insert({
    project_id: projectId,
    agent_id: byRole.get(role) ?? null,
    phase,
    content: content.trim(),
    metadata: metadata ?? {},
  });
  if (error) throw new Error(`Could not save intelligence message: ${error.message}`);
}

export async function insertEditorLensDecision(opts: {
  supabase: SupabaseClient;
  projectId: string;
  title: string;
  summary: string;
  status?: "proposed" | "accepted" | "rejected" | "superseded";
  metadata?: Record<string, unknown>;
}) {
  const { supabase, projectId, title, summary, status = "proposed", metadata } = opts;
  const { error } = await supabase.from("project_ai_agent_decisions").insert({
    project_id: projectId,
    title: title.trim(),
    summary: summary.trim(),
    status,
    metadata: metadata ?? {},
  });
  if (error) throw new Error(`Could not save intelligence decision: ${error.message}`);
}

export async function buildEditorIntelligencePromptBlock(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string> {
  try {
    const state = await loadEditorIntelligenceState(supabase, projectId);
    const decisions = (state.decisions as Array<{ title?: string; summary?: string; status?: string }>).slice(0, 8);
    const messages = (state.messages as Array<{
      phase?: string;
      content?: string;
      metadata?: Record<string, unknown> | null;
      agent?: { role?: string | null; name?: string | null } | null;
    }>).slice(0, 12);

    if (decisions.length === 0 && messages.length === 0) return "";

    const lines = [
      "---",
      "# Editor Intelligence Memory",
      "Internal project memory from LifemarkAI specialist lenses. Use it to preserve decisions, avoid repeated mistakes, and improve the next edit. Do not describe it as a separate workflow to the user.",
    ];

    if (decisions.length > 0) {
      lines.push("", "Recent decisions:");
      for (const decision of decisions) {
        lines.push(`- ${short(decision.title ?? "Decision", 80)}: ${short(decision.summary ?? "", 220)}`);
      }
    }

    if (messages.length > 0) {
      lines.push("", "Recent lens notes:");
      for (const message of messages) {
        const metadataRole = typeof message.metadata?.persisted_role === "string"
          ? message.metadata.persisted_role
          : undefined;
        const role = roleLabel(message.agent?.role ?? metadataRole);
        lines.push(`- ${role} / ${message.phase ?? "note"}: ${short(message.content ?? "", 220)}`);
      }
    }

    lines.push("---");
    return `\n\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

async function updateLensMemory(opts: {
  supabase: SupabaseClient;
  projectId: string;
  role: string;
  note: string;
  kind: "build" | "verification" | "backend" | "agent";
}) {
  const { supabase, projectId, role, note, kind } = opts;
  const { data: agent } = await supabase
    .from("project_ai_agents")
    .select("id, memory")
    .eq("project_id", projectId)
    .eq("role", role)
    .maybeSingle();
  if (!agent?.id) return;

  const memory = agent.memory && typeof agent.memory === "object" ? agent.memory : {};
  const notes = Array.isArray(memory.notes) ? memory.notes : [];
  const nextNotes = [
    { kind, note: short(note, 360), at: new Date().toISOString() },
    ...notes,
  ].slice(0, 20);

  await supabase
    .from("project_ai_agents")
    .update({
      memory: { ...memory, notes: nextNotes },
      status: "idle",
      last_active_at: new Date().toISOString(),
    })
    .eq("id", agent.id);
}

function summarizeBackendWiring(result?: AutoWireResult | null): string | null {
  if (!result?.intentDetected) return null;
  const parts = [
    result.cloudEnabled ? "cloud enabled" : null,
    result.credsInjected ? "credentials injected" : null,
    result.scaffoldAdded ? "Supabase client scaffolded" : null,
    result.migrationsApplied ? `${result.migrationsApplied} migration(s) applied` : null,
    result.migrationsPending ? `${result.migrationsPending} migration(s) pending approval` : null,
    ...result.notes,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : "backend intent detected";
}

function summarizeVerification(result?: SelfVerifyResult | null): string | null {
  if (!result) return null;
  if (result.passed) {
    return `Verification passed with ${result.engine}; fixes applied: ${result.fixesApplied}.`;
  }
  const errors = result.errors.length ? ` Issues: ${result.errors.map((e) => short(e, 120)).join(" | ")}` : "";
  return `Verification did not pass with ${result.engine}; fixes applied: ${result.fixesApplied}.${errors}`;
}

export async function recordEditorIntelligenceBuild(opts: {
  supabase: SupabaseClient;
  projectId: string;
  projectName?: string | null;
  source: "chat" | "agent" | "editor-intelligence";
  mode: string;
  prompt: string;
  filesChanged: string[];
  assistantMessageId?: string;
  backendWiring?: AutoWireResult | null;
  verification?: SelfVerifyResult | null;
}) {
  const {
    supabase,
    projectId,
    projectName,
    source,
    mode,
    prompt,
    filesChanged,
    assistantMessageId,
    backendWiring,
    verification,
  } = opts;

  try {
    await ensureEditorLensRoster(supabase, projectId, projectName ?? "Untitled project");
    const changed = filesChanged.length > 0 ? filesChanged.join(", ") : "no files";
    const buildNote = `${source}/${mode} request "${short(prompt, 120)}" changed ${filesChanged.length} file(s): ${short(changed, 260)}.`;
    const backendNote = summarizeBackendWiring(backendWiring);
    const verificationNote = summarizeVerification(verification);

    await insertEditorLensMessage({
      supabase,
      projectId,
      role: "product_manager",
      phase: "build_summary",
      content: buildNote,
      metadata: { source, mode, assistant_message_id: assistantMessageId ?? null, files_changed: filesChanged },
    });
    await updateLensMemory({ supabase, projectId, role: "product_manager", note: buildNote, kind: source === "agent" ? "agent" : "build" });

    await insertEditorLensMessage({
      supabase,
      projectId,
      role: "technical_architect",
      phase: "implementation_review",
      content: `Changed surface: ${short(changed, 360)}. Next edits should preserve existing architecture and only touch requested files.`,
      metadata: { source, mode, files_changed: filesChanged },
    });

    if (backendNote) {
      await insertEditorLensMessage({
        supabase,
        projectId,
        role: "database_engineer",
        phase: "backend_wiring",
        content: backendNote,
        metadata: { source, mode, backend_wiring: backendWiring ?? null },
      });
      await updateLensMemory({ supabase, projectId, role: "database_engineer", note: backendNote, kind: "backend" });
    }

    if (verificationNote) {
      await insertEditorLensMessage({
        supabase,
        projectId,
        role: "qa_engineer",
        phase: verification?.passed ? "verification_passed" : "verification_failed",
        content: verificationNote,
        metadata: { source, mode, verification: verification ?? null },
      });
      await updateLensMemory({ supabase, projectId, role: "qa_engineer", note: verificationNote, kind: "verification" });
    }

    await insertEditorLensDecision({
      supabase,
      projectId,
      title: `Build result: ${short(prompt, 90)}`,
      summary: [
        buildNote,
        backendNote ? `Backend: ${backendNote}` : null,
        verificationNote ? `QA: ${verificationNote}` : null,
      ].filter(Boolean).join(" "),
      status: verification && !verification.passed ? "proposed" : "accepted",
      metadata: { source, mode, assistant_message_id: assistantMessageId ?? null },
    });
  } catch {
    // Editor-intelligence memory is best-effort; never break the build.
  }
}
