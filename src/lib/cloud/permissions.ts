/**
 * Lifemark Cloud tool permissions — Allow / Ask / Never (Lovable parity).
 * Stored as JSONB on profiles.cloud_tool_permissions.
 */

export type CloudToolPermission = "allow" | "ask" | "never";

export type CloudToolId =
  | "database"
  | "storage"
  | "edge_functions"
  | "secrets"
  | "ai"
  | "deploy";

export const CLOUD_TOOL_LABELS: Record<CloudToolId, { label: string; description: string }> = {
  database: {
    label: "Database",
    description: "Schema changes, migrations, and SQL queries",
  },
  storage: {
    label: "Storage",
    description: "Bucket creation and file uploads",
  },
  edge_functions: {
    label: "Edge Functions",
    description: "Deploy and update serverless functions",
  },
  secrets: {
    label: "Secrets",
    description: "Read or write environment secrets",
  },
  ai: {
    label: "Built-in AI",
    description: "AI calls from deployed app endpoints",
  },
  deploy: {
    label: "Deploy",
    description: "Publish or rollback deployments",
  },
};

export const DEFAULT_CLOUD_TOOL_PERMISSIONS: Record<CloudToolId, CloudToolPermission> = {
  database: "ask",
  storage: "ask",
  edge_functions: "ask",
  secrets: "ask",
  ai: "ask",
  deploy: "ask",
};

const TOOL_IDS = Object.keys(DEFAULT_CLOUD_TOOL_PERMISSIONS) as CloudToolId[];
const VALID: CloudToolPermission[] = ["allow", "ask", "never"];

export function parseCloudToolPermissions(raw: unknown): Record<CloudToolId, CloudToolPermission> {
  const base = { ...DEFAULT_CLOUD_TOOL_PERMISSIONS };
  if (!raw || typeof raw !== "object") return base;

  for (const id of TOOL_IDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === "string" && VALID.includes(v as CloudToolPermission)) {
      base[id] = v as CloudToolPermission;
    }
  }
  return base;
}

/** Whether the AI/agent may run this cloud tool without prompting the user. */
export function canAutoRunCloudTool(
  tool: CloudToolId,
  perms: Record<CloudToolId, CloudToolPermission>
): boolean {
  return perms[tool] === "allow";
}

/** Whether the tool is blocked entirely. */
export function isCloudToolBlocked(
  tool: CloudToolId,
  perms: Record<CloudToolId, CloudToolPermission>
): boolean {
  return perms[tool] === "never";
}

/** Whether the UI should show a confirmation before running. */
export function needsCloudToolConfirmation(
  tool: CloudToolId,
  perms: Record<CloudToolId, CloudToolPermission>
): boolean {
  return perms[tool] === "ask";
}

const PERMISSION_INSTRUCTIONS: Record<CloudToolPermission, string> = {
  allow: "You may perform this automatically when building.",
  ask: "Describe the planned change and ask the user to confirm before executing.",
  never: "Do NOT perform this action. Tell the user to use the Lifemark Cloud panel manually.",
};

/** System-prompt block enforcing workspace Cloud tool permissions. */
export function buildCloudPermissionsPromptBlock(
  perms: Record<CloudToolId, CloudToolPermission>,
  cloudEnabled = false
): string {
  const lines = [
    "---",
    "# Lifemark Cloud Tool Permissions",
    cloudEnabled
      ? "This project has Lifemark Cloud enabled. Respect these workspace permission settings:"
      : "Lifemark Cloud is not active on this project. Do not provision cloud resources unless the user explicitly enables Cloud.",
  ];

  for (const id of TOOL_IDS) {
    const { label } = CLOUD_TOOL_LABELS[id];
    const level = perms[id];
    lines.push(`- ${label} (${id}): **${level}** — ${PERMISSION_INSTRUCTIONS[level]}`);
  }

  lines.push("---");
  return lines.join("\n");
}

/** Map a user/build prompt to the most relevant cloud tool (for confirmation UI). */
export function inferCloudToolFromPrompt(prompt: string): CloudToolId | null {
  const p = prompt.toLowerCase();
  if (/\b(deploy|publish|rollback|ship to prod)\b/.test(p)) return "deploy";
  if (/\b(edge function|serverless function|supabase function)\b/.test(p)) return "edge_functions";
  if (/\b(secret|env var|environment variable|api key)\b/.test(p)) return "secrets";
  if (/\b(storage|bucket|upload file|s3)\b/.test(p)) return "storage";
  if (/\b(migration|schema|sql|database table|alter table|create table)\b/.test(p)) return "database";
  if (/\b(openai|anthropic|ai endpoint|llm api|generate text)\b/.test(p) && /\bdeployed app\b/.test(p)) return "ai";
  return null;
}

/** Whether the AI should refuse a cloud action outright. */
export function shouldBlockCloudAction(
  prompt: string,
  perms: Record<CloudToolId, CloudToolPermission>
): { blocked: boolean; tool: CloudToolId | null; reason?: string } {
  const tool = inferCloudToolFromPrompt(prompt);
  if (!tool) return { blocked: false, tool: null };
  if (isCloudToolBlocked(tool, perms)) {
    const label = CLOUD_TOOL_LABELS[tool].label;
    return {
      blocked: true,
      tool,
      reason: `${label} is set to Never in your Cloud tool permissions. Use the Lifemark Cloud panel to make this change manually.`,
    };
  }
  return { blocked: false, tool };
}

/** Whether the AI must ask before acting on a cloud tool. */
export function requiresCloudConfirmation(
  prompt: string,
  perms: Record<CloudToolId, CloudToolPermission>
): { required: boolean; tool: CloudToolId | null } {
  const tool = inferCloudToolFromPrompt(prompt);
  if (!tool) return { required: false, tool: null };
  return { required: needsCloudToolConfirmation(tool, perms), tool };
}
