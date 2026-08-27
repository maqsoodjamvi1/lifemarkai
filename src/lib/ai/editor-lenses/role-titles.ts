/**
 * Display titles for the editor-intelligence lenses — the one copy.
 *
 * These were duplicated into ROLE_META in
 * components/editor/editor-intelligence-console.tsx, under a comment asking the
 * next person to keep them in sync by hand. The duplication itself was NOT a
 * mistake: roles.ts imports MODEL_TIERS, which reaches provider.ts and the
 * server AI SDKs, so a client component importing roles.ts would pull the
 * whole OpenAI/Anthropic stack into the browser bundle.
 *
 * The mistake was duplicating the WHOLE role definition's worth of display data
 * instead of splitting out the part that is safe to share. Titles are plain
 * strings with no dependencies, so they live here and both sides import them.
 * roles.ts composes them back into ROLES; the console reads them directly.
 *
 * They were in step when this was extracted, which is luck rather than process
 * — nothing had ever checked.
 */
import type { AgentRoleId } from "./types.ts";

export const ROLE_TITLES: Record<AgentRoleId, string> = {
  pm: "Product Manager",
  ba: "Business Analyst",
  architect: "Technical Architect",
  designer: "UI Designer",
  frontend: "Frontend Engineer",
  backend: "Backend Engineer",
  database: "Database Engineer",
  devops: "DevOps Engineer",
  qa: "QA Engineer",
  security: "Security Engineer",
  cto: "AI CTO",
};
