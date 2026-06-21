export type TitanAgentRole =
  | "product_manager"
  | "technical_architect"
  | "ui_designer"
  | "frontend_engineer"
  | "backend_engineer"
  | "database_engineer"
  | "devops_engineer"
  | "qa_engineer"
  | "security_engineer"
  | "business_analyst";

export interface TitanAgentDefinition {
  role: TitanAgentRole;
  name: string;
  title: string;
  responsibilities: string[];
}

export const TITAN_AGENT_DEFINITIONS: TitanAgentDefinition[] = [
  {
    role: "product_manager",
    name: "Product Manager",
    title: "Owns product scope, roadmap, and user outcomes",
    responsibilities: [
      "Turn raw prompts into product requirements",
      "Prioritize features and release slices",
      "Keep implementation aligned with user value",
    ],
  },
  {
    role: "technical_architect",
    name: "Technical Architect",
    title: "Designs the system architecture and technical tradeoffs",
    responsibilities: [
      "Define application architecture and module boundaries",
      "Review scalability, reliability, and maintainability",
      "Coordinate cross-cutting technical decisions",
    ],
  },
  {
    role: "ui_designer",
    name: "UI Designer",
    title: "Owns interaction design, visual quality, and responsive UX",
    responsibilities: [
      "Create screen structure and interaction flows",
      "Maintain visual consistency and accessibility",
      "Review generated UI against the product intent",
    ],
  },
  {
    role: "frontend_engineer",
    name: "Frontend Engineer",
    title: "Builds user-facing screens and client behavior",
    responsibilities: [
      "Implement React components and client state",
      "Wire forms, routes, and user interactions",
      "Keep frontend code typed, modular, and responsive",
    ],
  },
  {
    role: "backend_engineer",
    name: "Backend Engineer",
    title: "Builds server logic, APIs, and integrations",
    responsibilities: [
      "Design route handlers and service logic",
      "Integrate third-party APIs safely",
      "Validate permissions and server-side data flow",
    ],
  },
  {
    role: "database_engineer",
    name: "Database Engineer",
    title: "Owns schema, migrations, indexes, and data lifecycle",
    responsibilities: [
      "Design relational schema and migrations",
      "Review RLS, indexes, and query performance",
      "Plan audit, retention, and archival strategies",
    ],
  },
  {
    role: "devops_engineer",
    name: "DevOps Engineer",
    title: "Owns deployment, runtime, and operational readiness",
    responsibilities: [
      "Plan deployment and environment configuration",
      "Review build, preview, and release workflows",
      "Define monitoring, rollback, and incident practices",
    ],
  },
  {
    role: "qa_engineer",
    name: "QA Engineer",
    title: "Owns verification, test strategy, and acceptance checks",
    responsibilities: [
      "Define unit, integration, E2E, and regression tests",
      "Review edge cases and acceptance criteria",
      "Track defects and verification status",
    ],
  },
  {
    role: "security_engineer",
    name: "Security Engineer",
    title: "Owns threat modeling, vulnerabilities, and safe defaults",
    responsibilities: [
      "Review auth, authorization, and secret handling",
      "Scan dependencies, APIs, and generated code risks",
      "Propose mitigations and secure-by-default patterns",
    ],
  },
  {
    role: "business_analyst",
    name: "Business Analyst",
    title: "Owns market, monetization, and operating context",
    responsibilities: [
      "Research market, competitors, and personas",
      "Shape pricing, packaging, and growth assumptions",
      "Connect product work to business metrics",
    ],
  },
];

export function buildTitanAgentSeed(projectName: string) {
  return TITAN_AGENT_DEFINITIONS.map((agent) => ({
    role: agent.role,
    name: agent.name,
    title: agent.title,
    responsibilities: agent.responsibilities,
    memory: {
      projectName,
      notes: [],
      openQuestions: [],
      decisions: [],
    },
  }));
}
