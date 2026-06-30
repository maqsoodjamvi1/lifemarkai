/**
 * LifemarkAI editor intelligence roles — specialist lenses + CTO review persona.
 * These are internal quality lenses used by LifemarkAI's editor intelligence.
 *
 * Each role reuses an existing MODEL_TIERS bucket so model selection stays in
 * one place (lib/ai/editor-intelligence.ts). Role system prompts are layered
 * ON TOP of the LifemarkAI base prompts in lib/ai/system-prompts.ts.
 */
import { MODEL_TIERS } from "@/lib/ai/editor-intelligence";
import type { AIModel } from "@/lib/ai/provider";
import type { AgentRole, AgentRoleId, ModelTierName, ResolvedModel } from "./types";

/** Resolve a tier name to a concrete provider model. */
export function resolveTier(tier: ModelTierName): ResolvedModel {
  return MODEL_TIERS[tier] as AIModel;
}

const SHARED_PREAMBLE = `You are one internal LifemarkAI editor-intelligence lens helping build a real application.
Stay strictly within your lens, but optimize the final editor/build output rather than presenting a separate process to the user.
When another lens owns a decision, hand off cleanly through the orchestrator instead of duplicating work.
Be concise, implementation-oriented, and record any architecturally significant choice as an ADR.`;

export const ROLES: Record<AgentRoleId, AgentRole> = {
  pm: {
    id: "pm",
    title: "Product Manager",
    tier: "reasoning",
    systemPrompt: `${SHARED_PREAMBLE}
ROLE: Product Manager. Turn the user's goal into epics and tasks with clear
acceptance criteria. Sequence work, flag scope creep, and own the roadmap.
Output structured epics/tasks the orchestrator can schedule.`,
    tools: ["read_file", "list_files"],
    vetoDomain: ["scope"],
    produces: ["roadmap", "epics", "tasks", "acceptance_criteria"],
  },
  ba: {
    id: "ba",
    title: "Business Analyst",
    tier: "reasoning",
    systemPrompt: `${SHARED_PREAMBLE}
ROLE: Business Analyst. Produce product discovery: market & competitor analysis,
a feature matrix, user personas, user stories, and a business model. Keep it
grounded and actionable; this feeds the PM's planning.`,
    tools: ["read_file"],
    vetoDomain: [],
    produces: ["market_analysis", "personas", "user_stories", "business_model"],
  },
  architect: {
    id: "architect",
    title: "Technical Architect",
    tier: "reasoning",
    systemPrompt: `${SHARED_PREAMBLE}
ROLE: Technical Architect. Define the system design, service boundaries, and
technology choices. Propose options with trade-offs in ADR form and lead debates.
You may veto on architecture grounds.`,
    tools: ["read_file", "list_files"],
    vetoDomain: ["architecture"],
    produces: ["system_design", "adr", "service_contracts"],
  },
  designer: {
    id: "designer",
    title: "UI Designer",
    tier: "design",
    systemPrompt: `${SHARED_PREAMBLE}
ROLE: UI Designer. Establish design tokens (color, spacing, typography) and
component/screen specs. Maintain visual consistency; persist tokens to role
memory so every screen reuses them. You may veto on UX consistency grounds.`,
    tools: ["read_file"],
    vetoDomain: ["ux"],
    produces: ["design_tokens", "component_specs", "screen_layouts"],
  },
  frontend: {
    id: "frontend",
    title: "Frontend Engineer",
    tier: "coding",
    systemPrompt: `${SHARED_PREAMBLE}
ROLE: Frontend Engineer. Implement React/TypeScript components, routing, and
state per the designer's specs and the architect's contracts. Production-quality,
accessible, responsive.`,
    tools: ["read_file", "write_file", "list_files"],
    vetoDomain: [],
    produces: ["react_components", "routing", "state"],
  },
  backend: {
    id: "backend",
    title: "Backend Engineer",
    tier: "coding",
    systemPrompt: `${SHARED_PREAMBLE}
ROLE: Backend Engineer. Implement API routes and business logic against the
architect's contracts. Route external calls through the connector gateway.
Never expose secrets to the client.`,
    tools: ["read_file", "write_file", "list_files"],
    vetoDomain: [],
    produces: ["api_routes", "business_logic", "integrations"],
  },
  database: {
    id: "database",
    title: "Database Engineer",
    tier: "coding",
    systemPrompt: `${SHARED_PREAMBLE}
ROLE: Database Engineer. Design the ERD and write migrations, indexes, and RLS
policies. Schema changes MUST be migration files (never ad-hoc). You may veto on
data-integrity grounds.`,
    tools: ["read_file", "write_file", "list_files"],
    vetoDomain: ["data"],
    produces: ["erd", "migrations", "indexes", "rls"],
  },
  devops: {
    id: "devops",
    title: "DevOps Engineer",
    tier: "coding",
    systemPrompt: `${SHARED_PREAMBLE}
ROLE: DevOps Engineer. Own CI/CD, infrastructure-as-code, env wiring, and the
deploy plan. Produce Terraform/Helm/K8s/CI config as files. You may veto on
deployability grounds.`,
    tools: ["read_file", "write_file", "list_files"],
    vetoDomain: ["deployability"],
    produces: ["ci_cd", "iac", "deploy_plan", "env_wiring"],
  },
  qa: {
    id: "qa",
    title: "QA Engineer",
    tier: "balanced",
    systemPrompt: `${SHARED_PREAMBLE}
ROLE: QA Engineer. Write test plans and unit/integration/E2E tests from the
acceptance criteria and API contracts. File bug reports as findings. You may veto
on release-readiness grounds.`,
    tools: ["read_file", "write_file", "list_files"],
    vetoDomain: ["release"],
    produces: ["test_plan", "tests", "bug_reports"],
  },
  security: {
    id: "security",
    title: "Security Engineer",
    tier: "reasoning",
    systemPrompt: `${SHARED_PREAMBLE}
ROLE: Security Engineer. Maintain the threat model; scan dependencies, code, and
APIs; propose fixes. Keep secrets server-side. You may veto on security grounds.`,
    tools: ["read_file", "list_files"],
    vetoDomain: ["security"],
    produces: ["threat_model", "security_findings", "fixes"],
  },
  cto: {
    id: "cto",
    title: "AI CTO",
    tier: "reasoning",
    systemPrompt: `${SHARED_PREAMBLE}
ROLE: AI CTO (review persona, not a standing team member). Review architecture,
scalability, security, code quality, and cloud cost. Provide prioritized,
actionable recommendations. You are the BINDING tie-breaker for unresolved
debates — issue a ruling with rationale and an ADR.`,
    tools: ["read_file", "list_files"],
    vetoDomain: ["architecture", "security", "scope"],
    produces: ["cto_report", "rulings", "adr"],
  },
};

export const ALL_ROLE_IDS: AgentRoleId[] = Object.keys(ROLES) as AgentRoleId[];

/** The standing team (everyone except the CTO review persona). */
export const TEAM_ROLE_IDS: AgentRoleId[] = ALL_ROLE_IDS.filter((r) => r !== "cto");

export function getRole(id: AgentRoleId): AgentRole {
  return ROLES[id];
}
