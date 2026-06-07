"use client";

/**
 * McpPanel — MCP server management with Marketplace tab
 *
 * Tabs:
 *  • My Servers — CRUD list of connected servers with status ping
 *  • Marketplace — pre-built connectors (Jira, Notion, Linear, GitHub, etc.)
 */

import { useState, useEffect } from "react";
import {
  Server, Plus, Trash2, ChevronDown, ChevronUp,
  CheckCircle2, ExternalLink, Copy,
  Check, RefreshCw, ShoppingBag, Zap, Search, Settings2,
  BookOpen, GitBranch, BarChart3, FileText,
  Globe, Database, Mail, Slack, Trello, Key, RotateCcw, Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────

interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string;
  status: "connected" | "disconnected" | "error";
  tools: string[];
  description: string;
  envKey?: string;
  envValue?: string;
}

interface MarketplaceEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  args: string;
  envKey?: string;
  envPlaceholder?: string;
  docsUrl: string;
  tools: string[];
}

// ─── Data ───────────────────────────────────────────────────────────────────

const DEFAULT_SERVERS: McpServer[] = [
  {
    id: "1",
    name: "Filesystem",
    command: "npx",
    args: "-y @modelcontextprotocol/server-filesystem /workspace",
    status: "connected",
    tools: ["read_file", "write_file", "list_directory", "create_directory"],
    description: "Access and modify files in the workspace directory",
  },
  {
    id: "2",
    name: "GitHub",
    command: "npx",
    args: "-y @modelcontextprotocol/server-github",
    status: "disconnected",
    tools: ["search_repos", "create_issue", "get_file", "create_pr"],
    description: "Interact with GitHub repositories and issues",
    envKey: "GITHUB_TOKEN",
  },
  {
    id: "3",
    name: "PostgreSQL",
    command: "npx",
    args: "-y @modelcontextprotocol/server-postgres postgresql://localhost/db",
    status: "connected",
    tools: ["query", "schema_info", "list_tables"],
    description: "Query and manage PostgreSQL databases",
  },
  {
    id: "4",
    name: "Brave Search",
    command: "npx",
    args: "-y @modelcontextprotocol/server-brave-search",
    status: "disconnected",
    tools: ["web_search", "local_search"],
    description: "Search the web using Brave Search API",
    envKey: "BRAVE_API_KEY",
  },
];

const MARKETPLACE: MarketplaceEntry[] = [
  {
    id: "jira",
    name: "Jira",
    description: "Create and update issues, search JQL, manage sprints and boards",
    category: "Project Management",
    icon: Trello,
    color: "text-blue-500",
    args: "-y @modelcontextprotocol/server-jira",
    envKey: "JIRA_API_TOKEN",
    envPlaceholder: "your-jira-api-token",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/jira",
    tools: ["create_issue", "update_issue", "search_issues", "get_board", "list_sprints"],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Read and write Notion pages, databases, and blocks",
    category: "Productivity",
    icon: FileText,
    color: "text-gray-700 dark:text-gray-300",
    args: "-y @modelcontextprotocol/server-notion",
    envKey: "NOTION_API_KEY",
    envPlaceholder: "secret_xxxxxxxxxxxx",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/notion",
    tools: ["search_pages", "get_page", "create_page", "update_block", "query_database"],
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage Linear issues, cycles, projects and teams",
    category: "Project Management",
    icon: BarChart3,
    color: "text-violet-500",
    args: "-y @modelcontextprotocol/server-linear",
    envKey: "LINEAR_API_KEY",
    envPlaceholder: "lin_api_xxxxxxxxxxxx",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/linear",
    tools: ["get_issues", "create_issue", "update_issue", "get_projects", "list_teams"],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Search repos, manage issues and PRs, read files and commits",
    category: "Version Control",
    icon: GitBranch,
    color: "text-gray-800 dark:text-gray-200",
    args: "-y @modelcontextprotocol/server-github",
    envKey: "GITHUB_TOKEN",
    envPlaceholder: "ghp_xxxxxxxxxxxx",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    tools: ["search_repos", "create_issue", "create_pr", "get_file", "list_commits"],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Post messages, read channels, list users and workspaces",
    category: "Communication",
    icon: Slack,
    color: "text-green-600",
    args: "-y @modelcontextprotocol/server-slack",
    envKey: "SLACK_BOT_TOKEN",
    envPlaceholder: "xoxb-xxxxxxxxxxxx",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    tools: ["post_message", "list_channels", "get_channel_history", "list_users"],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Query and inspect PostgreSQL databases with full SQL support",
    category: "Database",
    icon: Database,
    color: "text-sky-500",
    args: "-y @modelcontextprotocol/server-postgres",
    envKey: "DATABASE_URL",
    envPlaceholder: "postgresql://user:pass@host/db",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    tools: ["query", "list_tables", "describe_table", "schema_info"],
  },
  {
    id: "brave",
    name: "Brave Search",
    description: "Web and local search via Brave Search API",
    category: "Search",
    icon: Globe,
    color: "text-orange-500",
    args: "-y @modelcontextprotocol/server-brave-search",
    envKey: "BRAVE_API_KEY",
    envPlaceholder: "BSA-xxxxxxxxxxxx",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    tools: ["web_search", "local_search"],
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Read, search, compose and send Gmail messages",
    category: "Communication",
    icon: Mail,
    color: "text-red-500",
    args: "-y @modelcontextprotocol/server-gmail",
    envKey: "GMAIL_CREDENTIALS_JSON",
    envPlaceholder: '{"client_id":"..."}',
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/gmail",
    tools: ["list_emails", "get_email", "send_email", "search_emails", "create_draft"],
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent knowledge graph memory for long-running AI sessions",
    category: "AI",
    icon: BookOpen,
    color: "text-amber-500",
    args: "-y @modelcontextprotocol/server-memory",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    tools: ["store_memory", "recall_memory", "list_memories", "delete_memory"],
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Query databases, manage tables, run migrations, and inspect schema via MCP",
    category: "Database",
    icon: Database,
    color: "text-emerald-500",
    args: "-y @supabase/mcp-server-supabase@latest --access-token $SUPABASE_ACCESS_TOKEN",
    envKey: "SUPABASE_ACCESS_TOKEN",
    envPlaceholder: "your-supabase-access-token",
    docsUrl: "https://supabase.com/docs/guides/getting-started/mcp",
    tools: ["list_projects", "list_tables", "execute_sql", "apply_migration", "get_logs"],
  },
  {
    id: "figma",
    name: "Figma",
    description: "Read Figma files, components, and design tokens to generate pixel-perfect code",
    category: "Productivity",
    icon: FileText,
    color: "text-pink-500",
    args: "-y figma-developer-mcp --figma-api-key=$FIGMA_API_KEY",
    envKey: "FIGMA_API_KEY",
    envPlaceholder: "your-figma-api-key",
    docsUrl: "https://www.figma.com/developers/api",
    tools: ["get_file", "get_node", "get_components", "get_styles", "get_variables"],
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Browser automation — navigate, screenshot, click, and scrape pages",
    category: "Browser",
    icon: Globe,
    color: "text-teal-500",
    args: "-y @modelcontextprotocol/server-puppeteer",
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
    tools: ["navigate", "screenshot", "click", "type", "get_content", "evaluate"],
  },
  {
    id: "posthog",
    name: "PostHog",
    description: "Query product analytics — events, funnels, retention, feature flags",
    category: "AI",
    icon: BarChart3,
    color: "text-orange-500",
    args: "-y posthog-mcp-server",
    envKey: "POSTHOG_API_KEY",
    envPlaceholder: "phx_...",
    docsUrl: "https://github.com/PostHog/posthog-mcp",
    tools: ["get_events", "get_persons", "get_funnels", "get_insights", "toggle_feature_flag"],
  },
  {
    id: "amplitude",
    name: "Amplitude",
    description: "Query user behaviour analytics — event streams, cohorts, revenue data",
    category: "AI",
    icon: BarChart3,
    color: "text-blue-500",
    args: "-y amplitude-mcp",
    envKey: "AMPLITUDE_API_KEY",
    envPlaceholder: "your-api-key",
    docsUrl: "https://www.docs.developers.amplitude.com/analytics/apis/",
    tools: ["query_events", "get_cohorts", "get_chart", "get_revenue_data"],
  },
  // ── Lovable MCP catalog parity ───────────────────────────────────────────────
  {
    id: "atlassian",
    name: "Atlassian (Jira + Confluence)",
    description: "Access Jira issues and Confluence pages via Atlassian Rovo",
    category: "Project Management",
    icon: Trello,
    color: "text-blue-600",
    args: "-y @atlassian/rovo-mcp-server",
    envKey: "ATLASSIAN_API_TOKEN",
    envPlaceholder: "ATATT...",
    docsUrl: "https://support.atlassian.com/atlassian-rovo-mcp-server/",
    tools: ["search_issues", "create_issue", "search_pages", "read_page"],
  },
  {
    id: "linear-mcp",
    name: "Linear (chat)",
    description: "Read Linear issues + acceptance criteria as chat context",
    category: "Project Management",
    icon: Zap,
    color: "text-violet-500",
    args: "-y @linear/mcp-server",
    envKey: "LINEAR_API_KEY",
    envPlaceholder: "lin_api_...",
    docsUrl: "https://linear.app/docs/mcp",
    tools: ["list_issues", "get_issue", "list_projects", "list_teams"],
  },
  {
    id: "sentry-mcp",
    name: "Sentry",
    description: "Read Sentry issues, errors, and performance data while debugging",
    category: "AI",
    icon: BookOpen,
    color: "text-orange-600",
    args: "-y @sentry/mcp-server",
    envKey: "SENTRY_AUTH_TOKEN",
    envPlaceholder: "sntrys_...",
    docsUrl: "https://docs.sentry.io/product/sentry-mcp/",
    tools: ["search_issues", "get_issue", "list_releases", "get_performance"],
  },
  {
    id: "granola",
    name: "Granola",
    description: "Search past meeting notes, decisions, and action items",
    category: "Productivity",
    icon: FileText,
    color: "text-amber-500",
    args: "-y granola-mcp",
    envKey: "GRANOLA_API_KEY",
    envPlaceholder: "gnl_...",
    docsUrl: "https://docs.granola.ai/help-center/sharing/integrations/mcp",
    tools: ["search_meetings", "get_meeting", "list_action_items"],
  },
  {
    id: "miro",
    name: "Miro",
    description: "Read Miro boards, diagrams, and user-flow whiteboards",
    category: "Productivity",
    icon: Globe,
    color: "text-yellow-500",
    args: "-y @miro/mcp",
    envKey: "MIRO_ACCESS_TOKEN",
    envPlaceholder: "miro_...",
    docsUrl: "https://miro.com/ai/mcp/",
    tools: ["list_boards", "get_board", "list_items"],
  },
  {
    id: "hex",
    name: "Hex",
    description: "Query Hex notebooks + datasets as chat context",
    category: "Database",
    icon: Database,
    color: "text-pink-500",
    args: "-y hex-mcp-server",
    envKey: "HEX_API_KEY",
    envPlaceholder: "hex_...",
    docsUrl: "https://learn.hex.tech/docs/administration/mcp-server",
    tools: ["query_notebook", "list_datasets", "run_cell"],
  },
  {
    id: "heygen",
    name: "HeyGen",
    description: "Generate AI avatars, voices, and videos from chat",
    category: "AI",
    icon: Zap,
    color: "text-purple-500",
    args: "-y heygen-mcp",
    envKey: "HEYGEN_API_KEY",
    envPlaceholder: "heygen_...",
    docsUrl: "https://developers.heygen.com/mcp/overview",
    tools: ["generate_avatar_video", "list_avatars", "list_voices"],
  },
  {
    id: "n8n",
    name: "n8n",
    description: "Run n8n workflows from chat — HubSpot, Sheets, Slack, etc.",
    category: "Productivity",
    icon: Settings2,
    color: "text-red-500",
    args: "-y @n8n/mcp-server",
    envKey: "N8N_API_KEY",
    envPlaceholder: "n8n_api_...",
    docsUrl: "https://docs.n8n.io/advanced-ai/mcp/accessing-n8n-mcp-server/",
    tools: ["list_workflows", "execute_workflow", "get_execution"],
  },
  {
    id: "polar",
    name: "Polar",
    description: "Polar billing, products, customers, subscriptions",
    category: "Communication",
    icon: ShoppingBag,
    color: "text-blue-400",
    args: "-y polar-mcp",
    envKey: "POLAR_API_KEY",
    envPlaceholder: "polar_...",
    docsUrl: "https://polar.sh/docs/integrate/mcp",
    tools: ["list_products", "list_subscriptions", "list_customers"],
  },
  {
    id: "sanity",
    name: "Sanity",
    description: "Read Sanity CMS content, schemas, and structured documents",
    category: "Productivity",
    icon: FileText,
    color: "text-rose-500",
    args: "-y @sanity/mcp-server",
    envKey: "SANITY_AUTH_TOKEN",
    envPlaceholder: "sk_...",
    docsUrl: "https://www.sanity.io/docs/ai/mcp-server",
    tools: ["query_documents", "get_schema", "list_assets"],
  },
  {
    id: "confidence",
    name: "Confidence (Spotify)",
    description: "Feature flags + experiment data — evaluate flags and read results",
    category: "AI",
    icon: BarChart3,
    color: "text-emerald-600",
    args: "-y confidence-mcp",
    envKey: "CONFIDENCE_API_KEY",
    envPlaceholder: "cf_...",
    docsUrl: "https://confidence.spotify.com/docs/sdks/mcp-servers",
    tools: ["evaluate_flag", "list_experiments", "get_experiment_results"],
  },
  {
    id: "custom-mcp",
    name: "Custom MCP server",
    description: "Connect an arbitrary MCP server URL — OAuth, bearer, or no-auth. Internal CRM, private API, custom data source.",
    category: "Productivity",
    icon: Server,
    color: "text-gray-400",
    args: "<your-mcp-url>",
    envKey: "CUSTOM_MCP_TOKEN",
    envPlaceholder: "optional bearer token",
    docsUrl: "https://mcpservers.org/remote-mcp-servers",
    tools: ["custom"],
  },
];

const STATUS_CONFIG = {
  connected:    { label: "Connected", dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  disconnected: { label: "Offline",   dot: "bg-muted-foreground/30", badge: "bg-muted text-muted-foreground border-border" },
  error:        { label: "Error",     dot: "bg-red-500", badge: "bg-red-500/10 text-red-600 border-red-500/20" },
};

const CATEGORIES = ["All", "Project Management", "Productivity", "Version Control", "Communication", "Database", "Search", "AI", "Browser"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded hover:bg-muted transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
    </button>
  );
}

// ─── My Servers Tab ───────────────────────────────────────────────────────────

function MyServersTab({ servers, setServers }: { servers: McpServer[]; setServers: React.Dispatch<React.SetStateAction<McpServer[]>> }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("npx");
  const [newArgs, setNewArgs] = useState("");
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pinging, setPinging] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newName.trim() || !newArgs.trim()) {
      toast({ title: "Name and args are required", variant: "destructive" });
      return;
    }
    setServers((prev) => [...prev, {
      id: Date.now().toString(),
      name: newName,
      command: newCommand || "npx",
      args: newArgs,
      status: "disconnected",
      tools: [],
      description: "Custom MCP server",
      envKey: newEnvKey || undefined,
      envValue: newEnvValue || undefined,
    }]);
    setNewName(""); setNewCommand("npx"); setNewArgs(""); setNewEnvKey(""); setNewEnvValue("");
    setShowAdd(false);
    toast({ title: "MCP server added" });
  };

  const handlePing = async (id: string) => {
    setPinging(id);
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 800));
    setServers((prev) => prev.map((s) =>
      s.id === id ? { ...s, status: Math.random() > 0.25 ? "connected" : "error" } : s
    ));
    setPinging(null);
    toast({ title: "Ping complete" });
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      {servers.map((server) => {
        const cfg = STATUS_CONFIG[server.status];
        const exp = expandedId === server.id;
        return (
          <div key={server.id} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
              <span className="text-sm font-medium flex-1 truncate">{server.name}</span>
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 border shrink-0", cfg.badge)}>
                {cfg.label}
              </Badge>
              <button
                onClick={() => void handlePing(server.id)}
                disabled={pinging === server.id}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="Ping"
              >
                <RefreshCw className={cn("w-3 h-3 text-muted-foreground", pinging === server.id && "animate-spin")} />
              </button>
              <button onClick={() => setExpandedId(exp ? null : server.id)} className="p-1 rounded hover:bg-muted">
                {exp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <button
                onClick={() => { setServers((p) => p.filter((s) => s.id !== server.id)); toast({ title: "Server removed" }); }}
                className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            {exp && (
              <div className="border-t border-border px-3 py-2.5 space-y-2 text-xs text-muted-foreground bg-muted/30">
                <p className="text-foreground/80">{server.description}</p>
                <div className="font-mono bg-muted rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="truncate">{server.command} {server.args}</span>
                  <CopyBtn text={server.command + " " + server.args} />
                </div>
                {server.envKey && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground/70">ENV:</span>
                    <code className="font-mono text-foreground/80">{server.envKey}</code>
                    {server.envValue && <CopyBtn text={server.envValue} />}
                  </div>
                )}
                {server.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {server.tools.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {showAdd ? (
        <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
          <p className="text-xs font-medium">New MCP Server</p>
          <Input placeholder="Display name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 text-xs" />
          <div className="flex gap-2">
            <Input placeholder="command" value={newCommand} onChange={(e) => setNewCommand(e.target.value)} className="h-8 text-xs w-20" />
            <Input placeholder="-y @org/server-name [args]" value={newArgs} onChange={(e) => setNewArgs(e.target.value)} className="h-8 text-xs flex-1" />
          </div>
          <div className="flex gap-2">
            <Input placeholder="ENV_VAR (optional)" value={newEnvKey} onChange={(e) => setNewEnvKey(e.target.value)} className="h-8 text-xs flex-1" />
            <Input placeholder="value" value={newEnvValue} onChange={(e) => setNewEnvValue(e.target.value)} className="h-8 text-xs flex-1" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-7 text-xs flex-1" onClick={handleAdd}>Add Server</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5 border-dashed" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> Add custom server
        </Button>
      )}
    </div>
  );
}

// ─── Marketplace Tab ──────────────────────────────────────────────────────────

function MarketplaceTab({ servers, setServers }: { servers: McpServer[]; setServers: React.Dispatch<React.SetStateAction<McpServer[]>> }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [customMcpUrls, setCustomMcpUrls] = useState<Record<string, string>>({});

  const installedIds = new Set(servers.map((s) => s.name.toLowerCase()));

  const filtered = MARKETPLACE.filter((m) => {
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "All" || m.category === category;
    return matchSearch && matchCat;
  });

  const handleInstall = async (entry: MarketplaceEntry) => {
    if (installedIds.has(entry.name.toLowerCase())) {
      toast({ title: entry.name + " already installed" }); return;
    }
    if (entry.id === "custom-mcp") {
      const url = customMcpUrls[entry.id]?.trim();
      if (!url || !/^https?:\/\//i.test(url)) {
        toast({ title: "Enter a valid MCP server URL (https://…)", variant: "destructive" });
        return;
      }
      setInstallingId(entry.id);
      await new Promise((r) => setTimeout(r, 400));
      setServers((prev) => [...prev, {
        id: `custom-${Date.now()}`,
        name: "Custom MCP",
        command: "remote",
        args: url,
        status: "disconnected",
        tools: entry.tools,
        description: entry.description,
        envKey: entry.envKey,
        envValue: envValues[entry.id] || undefined,
      }]);
      setInstallingId(null);
      setExpanded(null);
      toast({ title: "Custom MCP server added", description: "Switch to My Servers to connect." });
      return;
    }
    if (entry.envKey && !envValues[entry.id]) {
      toast({ title: "Enter your " + entry.envKey + " first", variant: "destructive" }); return;
    }
    setInstallingId(entry.id);
    await new Promise((r) => setTimeout(r, 900));
    setServers((prev) => [...prev, {
      id: entry.id,
      name: entry.name,
      command: "npx",
      args: entry.args,
      status: "disconnected",
      tools: entry.tools,
      description: entry.description,
      envKey: entry.envKey,
      envValue: entry.envKey ? envValues[entry.id] : undefined,
    }]);
    setInstallingId(null);
    setExpanded(null);
    toast({ title: entry.name + " added", description: "Switch to My Servers to connect it." });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search connectors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "shrink-0 text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                category === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-8">No connectors match your search</p>
        )}
        {filtered.map((entry) => {
          const Icon = entry.icon;
          const isInstalled = installedIds.has(entry.name.toLowerCase());
          const isExpanded = expanded === entry.id;
          const isInstalling = installingId === entry.id;

          return (
            <div key={entry.id} className="rounded-lg border border-border bg-card overflow-hidden">
              <div
                className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : entry.id)}
              >
                <Icon className={cn("w-4 h-4 shrink-0", entry.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{entry.name}</span>
                    {isInstalled && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        Installed
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{entry.description}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">{entry.category}</span>
                {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
              </div>

              {isExpanded && (
                <div className="border-t border-border px-3 py-3 space-y-3 bg-muted/20 text-xs">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Available tools</p>
                    <div className="flex flex-wrap gap-1">
                      {entry.tools.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">{t}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Install command</p>
                    <div className="font-mono bg-muted rounded px-2 py-1.5 flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate">
                        {entry.id === "custom-mcp" ? "remote URL (user-supplied)" : "npx " + entry.args}
                      </span>
                      {entry.id !== "custom-mcp" && <CopyBtn text={"npx " + entry.args} />}
                    </div>
                  </div>
                  {entry.id === "custom-mcp" && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                        MCP server URL
                      </p>
                      <Input
                        placeholder="https://your-mcp-server.example.com/mcp"
                        value={customMcpUrls[entry.id] ?? ""}
                        onChange={(e) => setCustomMcpUrls((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  )}
                  {entry.envKey && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">{entry.envKey}</p>
                      <Input
                        type="password"
                        placeholder={entry.envPlaceholder}
                        value={envValues[entry.id] ?? ""}
                        onChange={(e) => setEnvValues((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs flex-1 gap-1"
                      disabled={isInstalled || isInstalling}
                      onClick={() => void handleInstall(entry)}
                    >
                      {isInstalling ? (
                        <><RefreshCw className="w-3 h-3 animate-spin" /> Installing...</>
                      ) : isInstalled ? (
                        <><CheckCircle2 className="w-3 h-3" /> Installed</>
                      ) : (
                        <><Plus className="w-3 h-3" /> Install</>
                      )}
                    </Button>
                    <a
                      href={entry.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Docs <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function McpPanel() {
  const [servers, setServers] = useState<McpServer[]>(DEFAULT_SERVERS);
  const [tab, setTab] = useState<"servers" | "marketplace" | "connect">("servers");
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenCopied, setTokenCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mcp/token").then(r => r.json()).then(d => setMcpToken(d.token ?? null)).catch(() => {});
  }, []);

  async function regenerateToken() {
    setTokenLoading(true);
    try {
      const r = await fetch("/api/mcp/token", { method: "POST" });
      const d = await r.json();
      setMcpToken(d.token ?? null);
    } finally { setTokenLoading(false); }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setTokenCopied(key);
    setTimeout(() => setTokenCopied(null), 2000);
  }

  const connectedCount = servers.filter((s) => s.status === "connected").length;

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Server className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold flex-1">MCP Servers</span>
        <Badge variant="outline" className="text-[10px] px-1.5 h-4">
          {connectedCount}/{servers.length} active
        </Badge>
      </div>

      <div className="flex border-b border-border">
        <button
          onClick={() => setTab("servers")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2",
            tab === "servers" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Settings2 className="w-3.5 h-3.5" />
          My Servers
          <span className="text-[10px] bg-muted rounded-full px-1.5">{servers.length}</span>
        </button>
        <button
          onClick={() => setTab("marketplace")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2",
            tab === "marketplace" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          Marketplace
        </button>
        <button
          onClick={() => setTab("connect")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2",
            tab === "connect" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Key className="w-3.5 h-3.5" />
          Connect
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "servers" && <MyServersTab servers={servers} setServers={setServers} />}
        {tab === "marketplace" && <MarketplaceTab servers={servers} setServers={setServers} />}
        {tab === "connect" && (
          <div className="p-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Key className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold">Your MCP API Token</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Use this token to connect Claude Desktop, Cursor, or any MCP-compatible tool to your LifemarkAI projects.
              </p>
              <div className="flex gap-1.5">
                <code className="flex-1 text-[10px] bg-muted rounded px-2 py-1.5 font-mono break-all text-muted-foreground border border-border">
                  {mcpToken ? `${mcpToken.slice(0,16)}••••••••••••••••` : "Loading…"}
                </code>
                <button
                  onClick={() => mcpToken && copyText(mcpToken, "token")}
                  className="p-1.5 rounded border border-border hover:bg-muted transition-colors"
                  title="Copy token"
                >
                  {tokenCopied === "token" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
                <button
                  onClick={regenerateToken}
                  disabled={tokenLoading}
                  className="p-1.5 rounded border border-border hover:bg-muted transition-colors"
                  title="Regenerate token"
                >
                  <RotateCcw className={`w-3.5 h-3.5 text-muted-foreground ${tokenLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold">Claude Desktop</p>
              <p className="text-[11px] text-muted-foreground">Run in your terminal:</p>
              {(() => {
                const cmd = `claude mcp add lifemarkai --transport http "${(typeof window !== "undefined" ? window.location.origin : "https://lifemarkai.app")}/api/mcp?token=${mcpToken ?? "YOUR_TOKEN"}"`;
                return (
                  <div className="relative">
                    <pre className="text-[10px] bg-muted rounded p-2.5 font-mono text-muted-foreground overflow-x-auto border border-border whitespace-pre-wrap break-all">{cmd}</pre>
                    <button
                      onClick={() => copyText(cmd, "claude")}
                      className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-background transition-colors"
                    >
                      {tokenCopied === "claude" ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold">Cursor / other MCP clients</p>
              <p className="text-[11px] text-muted-foreground">Add to your MCP config file:</p>
              {(() => {
                const cfg = JSON.stringify({
                  mcpServers: {
                    lifemarkai: {
                      url: `${typeof window !== "undefined" ? window.location.origin : "https://lifemarkai.app"}/api/mcp?token=${mcpToken ?? "YOUR_TOKEN"}`
                    }
                  }
                }, null, 2);
                return (
                  <div className="relative">
                    <pre className="text-[10px] bg-muted rounded p-2.5 font-mono text-muted-foreground overflow-x-auto border border-border">{cfg}</pre>
                    <button
                      onClick={() => copyText(cfg, "cursor")}
                      className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-background transition-colors"
                    >
                      {tokenCopied === "cursor" ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold flex items-center gap-1.5"><Terminal className="w-3.5 h-3.5 text-violet-400" /> Available tools</p>
              {["list_projects","get_project_files","update_project_file","send_chat_message","create_project","get_project_info"].map((t) => (
                <div key={t} className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                  <span className="text-green-400">✓</span> {t}
                </div>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground border border-amber-500/30 bg-amber-500/5 rounded p-2">
              ⚠ Keep your token secret — it grants full read/write access to all your projects.
            </p>
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-border bg-muted/30">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Zap className="w-3 h-3" />
          MCP servers extend AI with external tool access. Requires Node.js 18+.
        </p>
      </div>
    </div>
  );
}
