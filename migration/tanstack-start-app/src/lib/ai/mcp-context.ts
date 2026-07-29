/**
 * TOMBSTONE — this module used to inject fabricated data into live AI prompts.
 *
 * WHAT IT DID
 * -----------
 * `buildMcpContextBlock(envKeys)` appended a section headed `# Live MCP Context`
 * to the system prompt whenever the project's `.env.local` contained a matching
 * key. The catalogue it appended was entirely HARDCODED DEMO DATA copied from
 * the UI preview panel:
 *
 *   LINEAR_API_KEY            -> "[ENG-142] Redesign onboarding flow — In Progress"
 *   NEXT_PUBLIC_SENTRY_DSN    -> a fake TypeError with a fake event count
 *   GITHUB_ACCESS_TOKEN       -> three invented issue numbers
 *   NEXT_PUBLIC_POSTHOG_KEY   -> invented funnel percentages
 *   NEXT_PUBLIC_SUPABASE_URL  -> LifemarkAI's OWN table list (profiles, projects,
 *                                project_files, messages, collaborators,
 *                                deployments) presented as the USER's schema
 *
 * WHY IT MATTERED
 * ---------------
 * The header claimed the content was live. It was not. Because
 * NEXT_PUBLIC_SUPABASE_URL is present in essentially every backend-enabled
 * project, the majority of builds were handed a fictional database schema and
 * told it was theirs — so the model would confidently generate queries against
 * tables the user's app does not have. This made output measurably worse and was
 * indistinguishable from a model hallucination when debugging.
 *
 * The only consumer was the live chat prompt path (`lib/ai/http/chat.ts`). The
 * MCP settings UI (`components/editor/mcp-context-panel.tsx`) keeps its own
 * catalogue for display purposes and never imported this file.
 *
 * IF YOU WANT THIS FEATURE
 * ------------------------
 * Fetch the data for real. `lib/ai/mcp-client.ts` already speaks MCP and
 * `routes/api/mcp/servers.ts` lists the user's configured servers; a real
 * implementation would call those per request and inject only what it actually
 * received. Anything that cannot be fetched must be omitted, never simulated —
 * a prompt block that lies is worse than no prompt block.
 */

export interface McpContextSource {
  id: string;
  configKey: string;
  block: string;
}

/** Intentionally empty. See the file header before adding anything here. */
export const MCP_CONTEXT_SOURCES: McpContextSource[] = [];

/**
 * Always returns "" — kept so any straggling import keeps compiling rather than
 * silently resurrecting the fabricated blocks.
 */
export function buildMcpContextBlock(_envKeys: Set<string> | string[]): string {
  return "";
}
