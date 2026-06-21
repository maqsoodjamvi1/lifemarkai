import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";
import {
  TITAN_AGENT_DEFINITIONS,
  buildTitanAgentSeed,
} from "@/lib/titan/company-agents";

interface Params {
  params: Promise<{ id: string }>;
}

async function loadProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
) {
  const { data, error } = await (supabase as any)
    .from("projects")
    .select("id, name, description, framework, status, user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Could not load project: ${error.message}`);
  return data;
}

async function ensureAgents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  projectName: string,
) {
  const { data: existing, error: existingError } = await (supabase as any)
    .from("project_ai_agents")
    .select("role")
    .eq("project_id", projectId);
  if (existingError) throw new Error(`Could not load AI agents: ${existingError.message}`);

  const existingRoles = new Set((existing ?? []).map((agent: { role: string }) => agent.role));
  const missing = buildTitanAgentSeed(projectName)
    .filter((agent) => !existingRoles.has(agent.role))
    .map((agent) => ({
      project_id: projectId,
      ...agent,
    }));

  if (missing.length > 0) {
    const { error: upsertError } = await (supabase as any)
      .from("project_ai_agents")
      .upsert(missing, { onConflict: "project_id,role" });
    if (upsertError) throw new Error(`Could not create AI agents: ${upsertError.message}`);
  }

  const { data: agents, error: agentsError } = await (supabase as any)
    .from("project_ai_agents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (agentsError) throw new Error(`Could not reload AI agents: ${agentsError.message}`);

  const { count: messageCount, error: countError } = await (supabase as any)
    .from("project_ai_agent_messages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (countError) throw new Error(`Could not inspect agent discussion: ${countError.message}`);

  if ((messageCount ?? 0) === 0 && agents?.length) {
    const agentByRole = new Map(agents.map((agent: any) => [agent.role, agent.id]));
    const kickoffMessages = [
      {
        role: "product_manager",
        content:
          "Kickoff: I will convert the user's goal into a PRD, release slices, acceptance criteria, and a roadmap before implementation.",
      },
      {
        role: "technical_architect",
        content:
          "Architecture review starts with module boundaries, data ownership, integration risks, and deployment constraints.",
      },
      {
        role: "ui_designer",
        content:
          "Design review will define the primary workflows, responsive layout, empty states, and visual consistency requirements.",
      },
      {
        role: "qa_engineer",
        content:
          "QA will track acceptance checks, regression risks, and the test plan for each release slice.",
      },
      {
        role: "security_engineer",
        content:
          "Security will review auth, authorization, RLS, secrets, generated APIs, and dependency risk before launch.",
      },
    ].map((message) => ({
      project_id: projectId,
      agent_id: agentByRole.get(message.role) ?? null,
      phase: "kickoff",
      content: message.content,
      metadata: { source: "bootstrap" },
    }));

    const { error: kickoffError } = await (supabase as any)
      .from("project_ai_agent_messages")
      .insert(kickoffMessages);
    if (kickoffError) throw new Error(`Could not seed kickoff discussion: ${kickoffError.message}`);
  }
}

async function loadCompanyState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
) {
  const [agentsRes, messagesRes, decisionsRes] = await Promise.all([
    (supabase as any)
      .from("project_ai_agents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    (supabase as any)
      .from("project_ai_agent_messages")
      .select("*, agent:project_ai_agents(id, role, name)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50),
    (supabase as any)
      .from("project_ai_agent_decisions")
      .select("*, agent:project_ai_agents(id, role, name)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (agentsRes.error) throw new Error(`Could not load AI agents: ${agentsRes.error.message}`);
  if (messagesRes.error) throw new Error(`Could not load agent discussion: ${messagesRes.error.message}`);
  if (decisionsRes.error) throw new Error(`Could not load agent decisions: ${decisionsRes.error.message}`);

  return {
    agents: agentsRes.data ?? [],
    messages: messagesRes.data ?? [],
    decisions: decisionsRes.data ?? [],
    roles: TITAN_AGENT_DEFINITIONS,
  };
}

function errorResponse(error: unknown, fallback = "AI company request failed") {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const project = await loadProject(supabase, id);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const state = await loadCompanyState(supabase, id);
    return NextResponse.json({ project, ...state });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const project = await loadProject(supabase, id);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({})) as {
      action?: "bootstrap" | "message" | "decision";
      role?: string;
      content?: string;
      title?: string;
      summary?: string;
    };

    if (body.action === "bootstrap") {
      await ensureAgents(supabase, id, project.name ?? "Untitled project");
    } else if (body.action === "message") {
      if (!body.role || !body.content?.trim()) {
        return NextResponse.json({ error: "role and content are required" }, { status: 400 });
      }
      await ensureAgents(supabase, id, project.name ?? "Untitled project");
      const { data: agent, error: agentError } = await (supabase as any)
        .from("project_ai_agents")
        .select("id")
        .eq("project_id", id)
        .eq("role", body.role)
        .maybeSingle();
      if (agentError) throw new Error(`Could not find AI agent: ${agentError.message}`);
      if (!agent) return NextResponse.json({ error: `Unknown agent role: ${body.role}` }, { status: 400 });

      const { error: messageError } = await (supabase as any).from("project_ai_agent_messages").insert({
        project_id: id,
        agent_id: agent.id,
        phase: "manual",
        content: body.content.trim(),
        metadata: { source: "user", user_id: user.id },
      });
      if (messageError) throw new Error(`Could not save agent message: ${messageError.message}`);
    } else if (body.action === "decision") {
      if (!body.title?.trim() || !body.summary?.trim()) {
        return NextResponse.json({ error: "title and summary are required" }, { status: 400 });
      }
      await ensureAgents(supabase, id, project.name ?? "Untitled project");
      const { error: decisionError } = await (supabase as any).from("project_ai_agent_decisions").insert({
        project_id: id,
        title: body.title.trim(),
        summary: body.summary.trim(),
        status: "proposed",
        metadata: { source: "user", user_id: user.id },
      });
      if (decisionError) throw new Error(`Could not save agent decision: ${decisionError.message}`);
    } else {
      return NextResponse.json({ error: "Unknown action. Use bootstrap, message, or decision." }, { status: 400 });
    }

    const state = await loadCompanyState(supabase, id);
    return NextResponse.json({ project, ...state });
  } catch (error) {
    return errorResponse(error);
  }
}
