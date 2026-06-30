/**
 * LifemarkAI editor intelligence — core types for the internal specialist lenses.
 * These types back LifemarkAI's internal specialist-review flow.
 *
 * These application types mirror the migration-068 tables but stay decoupled
 * from the generated `types/database.ts` rows so the orchestrator can be unit
 * tested without a live DB.
 */
import type { AIModel } from "@/lib/ai/provider";

/** Internal editor-intelligence lenses + the CTO review persona. */
export type AgentRoleId =
  | "pm"
  | "ba"
  | "architect"
  | "designer"
  | "frontend"
  | "backend"
  | "database"
  | "devops"
  | "qa"
  | "security"
  | "cto";

/** Which MODEL_TIERS bucket a role uses (resolved in roles.ts). */
export type ModelTierName =
  | "coding"
  | "design"
  | "content"
  | "reasoning"
  | "chat"
  | "balanced"
  | "fast";

/** Domains a role is allowed to block a decision on, during a debate. */
export type VetoDomain =
  | "scope"
  | "architecture"
  | "ux"
  | "data"
  | "deployability"
  | "release"
  | "security";

export interface AgentRole {
  id: AgentRoleId;
  title: string;
  /** MODEL_TIERS bucket → resolved to a concrete AIModel at run time. */
  tier: ModelTierName;
  /** Role system prompt (prepended to LifemarkAI base prompts). */
  systemPrompt: string;
  /** Tools this role may call inside an agent.ts run. */
  tools: string[];
  /** What this role may veto during debate; empty = cannot block. */
  vetoDomain: VetoDomain[];
  /** Artifacts the role owns/produces (for handoff routing). */
  produces: string[];
}

/** Normalized multimodal Spec (doc 04 §7). */
export interface Spec {
  source: "text" | "voice" | "screenshot" | "figma" | "pdf" | "video" | "url";
  prd: {
    summary: string;
    goals: string[];
    personas: string[];
    userStories: string[];
  };
  screens: Array<{ name: string; components: string[]; notes?: string }>;
  dataModel: Array<{ entity: string; fields: string[] }>;
  designTokens?: {
    colors?: Record<string, string>;
    spacing?: Record<string, string>;
    typography?: Record<string, string>;
  };
  provenance?: { cleanRoom: boolean; sources: string[] };
}

export type TaskStatus =
  | "pending"
  | "ready"
  | "in_progress"
  | "blocked"
  | "done"
  | "failed"
  | "skipped";

export interface EditorTask {
  id: string;
  epic?: string;
  role: AgentRoleId;
  title: string;
  description?: string;
  acceptance?: string;
  status: TaskStatus;
  dependsOn: string[];
  /** 0..100 — drives whether a debate is convened before execution. */
  risk: number;
  effort?: number;
  result?: unknown;
}

export interface Epic {
  title: string;
  tasks: EditorTask[];
}

export interface InitiativeCheckpoint {
  phase?: "planning" | "debating" | "executing" | "verifying" | "done";
  epics?: Epic[];
  creditsUsed?: number;
  filesChanged?: string[];
  completedDebates?: string[];
  wave?: number;
  updatedAt?: string;
}

export interface AutonomyGates {
  database: "never" | "ask" | "allow";
  deploy: "never" | "ask" | "allow";
  spend: "budget" | "unlimited";
  liveEnv: "block";
}

export interface InitiativeOptions {
  initiativeId?: string;
  projectId: string;
  userId: string;
  goal: string;
  spec?: Spec;
  files: Array<{ path: string; content: string }>;
  autonomy?: Partial<AutonomyGates>;
  budgetCredits?: number;
  checkpoint?: InitiativeCheckpoint | null;
  onCheckpoint?: (checkpoint: InitiativeCheckpoint) => Promise<void> | void;
  /** 'live' projects reject code-writing with 423 (migration 046). */
  environment?: "test" | "live";
  /**
   * Optional real executor for code-writing tasks. When provided, write-capable
   * roles run this instead of a single LLM call — the route wires it to the
   * agent.ts ReAct loop (the full 10-tool agent) so editor lenses actually read,
   * edit, and write files. Falls back to a single generation when omitted.
   */
  executeCodeTask?: (input: {
    role: AgentRoleId;
    title: string;
    acceptance?: string;
    files: Array<{ path: string; content: string }>;
  }) => Promise<{ files: Array<{ path: string; content: string }>; summary?: string }>;
}

/** Streamed events — mirror the SSE contract in doc 07 §3. */
export type EditorIntelligenceEvent =
  | { type: "initiative_status"; status: string }
  | { type: "agent_status"; role: AgentRoleId; state: "running" | "done" | "error"; summary?: string }
  | { type: "plan"; epics: Epic[] }
  | { type: "debate_status"; topic: string; round: number }
  | { type: "agent_message"; from: AgentRoleId; to?: AgentRoleId; channel: string; content: string }
  | { type: "decision"; topic: string; decision: string; decidedBy: string; rationale?: string }
  | { type: "wave_start"; wave: number; taskIds: string[] }
  | { type: "task_status"; taskId: string; role: AgentRoleId; status: TaskStatus }
  | { type: "file_change"; path: string }
  | { type: "gate"; kind: "database" | "deploy" | "spend"; needsApproval: boolean }
  | { type: "verify_status"; ok: boolean }
  | { type: "error"; message: string }
  | {
      type: "done";
      initiativeId: string;
      filesChanged: string[];
      creditsUsed: number;
      verification?: unknown;
    };

export interface CtoRecommendation {
  lens: "architecture" | "scalability" | "security" | "code_quality" | "cloud_cost";
  impact: "low" | "med" | "high";
  effort: "low" | "med" | "high";
  finding: string;
  action: string;
  adr?: string;
}

export interface CtoReport {
  recommendations: CtoRecommendation[];
  costSummary: { aiCents: number; instanceCents: number };
}

/** Resolved model for a role (tier name → concrete provider model). */
export type ResolvedModel = AIModel;
