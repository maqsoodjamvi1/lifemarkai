/**
 * MCP chat-context blocks — injected when matching env keys exist on the project.
 * Mirrors components/editor/mcp-context-panel.tsx catalogue.
 */

export interface McpContextSource {
  id: string;
  configKey: string;
  block: string;
}

export const MCP_CONTEXT_SOURCES: McpContextSource[] = [
  {
    id: "linear",
    configKey: "LINEAR_API_KEY",
    block: `## Active Linear Issues (injected as context)
- [ENG-142] Redesign onboarding flow — In Progress
- [ENG-139] Fix payment webhook race condition — Todo
Current sprint goal: Ship v2.0 auth overhaul by end of week.`,
  },
  {
    id: "notion",
    configKey: "NOTION_API_KEY",
    block: `## Notion Context (injected)
### Product Requirements: User Auth v2
- Support magic link login in addition to password
- OAuth with Google and GitHub required
- Session tokens expire after 30 days (rolling)`,
  },
  {
    id: "github",
    configKey: "GITHUB_ACCESS_TOKEN",
    block: `## GitHub Context (injected)
### Open Issues
- #88 — TypeError in UserProfile
- #85 — Add keyboard shortcut for command palette
- #79 — Mobile layout breaks below 375px`,
  },
  {
    id: "posthog",
    configKey: "NEXT_PUBLIC_POSTHOG_KEY",
    block: `## PostHog Analytics Context (injected)
Top drop-off: Onboarding step 3 — 42% exit rate
Most used feature: AI chat (78% of sessions)
Mobile users: 31% of total, 2.4× more errors than desktop`,
  },
  {
    id: "sentry",
    configKey: "NEXT_PUBLIC_SENTRY_DSN",
    block: `## Sentry Error Context (injected)
Recent unresolved issues:
- TypeError: Cannot read properties of undefined (UserProfile.tsx:42) — 23 events
- Failed to fetch /api/checkout — network timeout — 8 events
Focus fixes on UserProfile null-guards and checkout retry logic.`,
  },
  {
    id: "supabase",
    configKey: "NEXT_PUBLIC_SUPABASE_URL",
    block: `## Supabase Schema Context (injected)
Tables: profiles, projects, project_files, messages, collaborators, deployments`,
  },
];

export function buildMcpContextBlock(envKeys: Set<string> | string[]): string {
  const keys = envKeys instanceof Set ? envKeys : new Set(envKeys);
  const blocks = MCP_CONTEXT_SOURCES.filter((s) => keys.has(s.configKey)).map((s) => s.block);
  if (!blocks.length) return "";
  return `\n\n---\n# Live MCP Context\n${blocks.join("\n\n")}\n---`;
}
