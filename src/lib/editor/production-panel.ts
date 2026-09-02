/**
 * Production editor chrome: one door per job.
 * Duplicate / research tabs stay in the repo but must not open as sibling rails.
 */

export type PanelOpenResult =
  | { kind: "history" }
  | { kind: "chat-mode"; panel: "chat" | "plan" | "agent" }
  | { kind: "right"; panel: string }
  | { kind: "ignore" };

/** Extra ids that are the same product surface. */
export const PANEL_ALIASES: Record<string, string> = {
  supabase: "cloud",
  dbmanager: "cloud",
  dbquery: "cloud",
  schema: "cloud",
  storage: "cloud",
  secrets: "cloud",
  env: "cloud",
  customemail: "cloud",
  appauth: "cloud",
  edgefn: "cloud",
  email: "cloud",
  monetize: "payments",
  appconnectors: "connectors",
  mcp: "connectors",
  deploys: "publishpanel",
};

const CHAT_MODES = new Set(["chat", "plan", "agent"]);

/** Secondary panels that may occupy the canvas. Everything else is ignored. */
export const PRODUCTION_RIGHT_PANELS = new Set([
  "analytics",
  "cloud",
  "payments",
  "security",
  "seo",
  "github",
  "collab",
  "comments",
  "settings",
  "publishpanel",
  "domains",
  "connectors",
  "figma",
  "intelligence",
  "diffviewer",
]);

export const PRODUCTION_PANEL_LABELS: Record<string, string> = {
  chat: "Chat",
  plan: "Plan",
  agent: "Agent",
  analytics: "Analytics",
  cloud: "Cloud",
  payments: "Payments",
  security: "Security",
  seo: "SEO",
  github: "Git",
  collab: "People",
  comments: "Comments",
  settings: "Settings",
  publishpanel: "Publish",
  domains: "Domains",
  connectors: "Connectors",
  figma: "Figma",
  intelligence: "Team",
  diffviewer: "Diff",
  history: "History",
};

export function resolvePanelOpen(raw: string): PanelOpenResult {
  if (raw === "history") return { kind: "history" };
  const mapped = PANEL_ALIASES[raw] ?? raw;
  if (CHAT_MODES.has(mapped)) {
    return { kind: "chat-mode", panel: mapped as "chat" | "plan" | "agent" };
  }
  if (PRODUCTION_RIGHT_PANELS.has(mapped)) {
    return { kind: "right", panel: mapped };
  }
  return { kind: "ignore" };
}

export function productionPanelLabel(id: string): string {
  const mapped = PANEL_ALIASES[id] ?? id;
  return PRODUCTION_PANEL_LABELS[mapped] ?? mapped;
}
