/**
 * Detect connectors named in a chat turn so the model wires them in-place
 * instead of telling the user to open a panel.
 */

const MENTION_RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: "github", pattern: /\bgithub\b/i },
  { id: "stripe", pattern: /\bstripe\b/i },
  { id: "supabase", pattern: /\bsupabase\b/i },
  { id: "figma", pattern: /\bfigma\b/i },
  { id: "slack", pattern: /\bslack\b/i },
  { id: "resend", pattern: /\bresend\b/i },
  { id: "notion", pattern: /\bnotion\b/i },
];

const AT_MENTION = /@connector:([\w-]+)/g;

export function detectMentionedConnectors(text: string): string[] {
  if (typeof text !== "string" || !text) return [];
  const found = new Set<string>();
  for (const rule of MENTION_RULES) {
    if (rule.pattern.test(text)) found.add(rule.id);
  }
  for (const match of text.matchAll(AT_MENTION)) {
    if (match[1]) found.add(match[1].toLowerCase());
  }
  return [...found];
}

export function formatConnectorTurnBlock(projectId: string, connectorIds: string[]): string {
  if (connectorIds.length === 0) return "";
  const names = connectorIds.join(", ");
  return `

---
# This turn's connectors
The user named: ${names}.
Implement the integration in this same response — do not say "open the Connectors panel" as the only next step.
- Stripe / Slack / Resend / Notion: call POST /api/projects/${projectId}/connector-proxy with { "connector": "<id>", "path": "...", "method": "...", "body": ... }. Never put API keys in client code. If the key is missing, still write the gateway client and one sentence that they can paste the key in Connectors.
- Supabase: use the shared \`import { supabase } from "./lib/supabase"\` client. Do not create a second client.
- GitHub: use the project's GitHub panel sync; do not invent a personal access token in the app.
- Figma: match the described layout in code this turn; do not ask them to export frames first unless a file is required.
---`;
}
