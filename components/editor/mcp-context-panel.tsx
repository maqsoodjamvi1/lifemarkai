"use client";

/**
 * McpContextPanel
 * Chat connectors that inject live context into AI prompts during building.
 * Each connected MCP server contributes data snippets (issues, pages, boards)
 * that are injected into the system prompt before each AI generation.
 *
 * This is separate from the MCP management panel (which manages server config).
 * This panel focuses on WHAT context is being contributed and lets users preview it.
 */

import { useState, useEffect } from "react";
import {
  MessageSquare, CheckCircle2, Circle, ChevronDown, ChevronRight,
  ExternalLink, RefreshCw, Loader2, Eye, EyeOff, Zap, AlertCircle,
  Database, FileText, BarChart2, GitBranch, Layout,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContextSource {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  docsUrl: string;
  contextType: string; // what kind of data this contributes
  sampleContext: string; // example of what gets injected
  configKey: string; // env var key to check if connected
}

interface ContextSnippet {
  sourceId: string;
  title: string;
  preview: string;
  tokenCount: number;
}

// ─── Chat connector catalogue ─────────────────────────────────────────────────

const CONTEXT_SOURCES: ContextSource[] = [
  {
    id: "linear",
    name: "Linear",
    description: "Inject your active sprint issues and specs as context",
    icon: GitBranch,
    color: "bg-violet-500/15 text-violet-400",
    docsUrl: "https://developers.linear.app/docs",
    contextType: "Issues & specs",
    configKey: "LINEAR_API_KEY",
    sampleContext: `## Active Linear Issues (injected as context)
- [ENG-142] Redesign onboarding flow — In Progress
- [ENG-139] Fix payment webhook race condition — Todo
- [ENG-127] Add dark mode support — In Review
Current sprint goal: Ship v2.0 auth overhaul by end of week.`,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Pull in docs, PRDs, and design decisions as building context",
    icon: FileText,
    color: "bg-stone-500/15 text-stone-300",
    docsUrl: "https://developers.notion.com/",
    contextType: "Docs & PRDs",
    configKey: "NOTION_API_KEY",
    sampleContext: `## Notion Context (injected)
### Product Requirements: User Auth v2
- Support magic link login in addition to password
- OAuth with Google and GitHub required
- Session tokens expire after 30 days (rolling)
- MFA optional but encouraged for enterprise users`,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Open issues and PR descriptions inform code generation",
    icon: GitBranch,
    color: "bg-stone-500/15 text-stone-300",
    docsUrl: "https://docs.github.com/en/rest",
    contextType: "Issues & PRs",
    configKey: "GITHUB_ACCESS_TOKEN",
    sampleContext: `## GitHub Context (injected)
### Open Issues (3 of 12 shown)
- #88 — TypeError: Cannot read props of undefined in UserProfile
- #85 — Add keyboard shortcut ⌘K for command palette
- #79 — Mobile layout breaks below 375px on iOS Safari`,
  },
  {
    id: "posthog",
    name: "PostHog",
    description: "Real user analytics inform UX decisions during building",
    icon: BarChart2,
    color: "bg-orange-500/15 text-orange-400",
    docsUrl: "https://posthog.com/docs",
    contextType: "Analytics insights",
    configKey: "POSTHOG_API_KEY",
    sampleContext: `## PostHog Analytics Context (injected)
Top drop-off point: Onboarding step 3 (email verification) — 42% exit rate
Most used feature: AI chat (78% of sessions)
Least used: Export as ZIP (3% of sessions)
Mobile users: 31% of total, currently have 2.4× more errors than desktop`,
  },
  {
    id: "miro",
    name: "Miro",
    description: "Board diagrams and wireframes guide component generation",
    icon: Layout,
    color: "bg-yellow-500/15 text-yellow-400",
    docsUrl: "https://developers.miro.com/",
    contextType: "Diagrams & wireframes",
    configKey: "MIRO_ACCESS_TOKEN",
    sampleContext: `## Miro Board Context (injected)
### Wireframe: Dashboard Redesign (Board: "Q3 Designs")
Layout: 3-column grid, left sidebar nav (240px), main content area
Components identified: ProjectCard, StatsBar, ActivityFeed, QuickActions
Color tokens from board: primary=#6366f1, bg=#09090b, surface=#1c1c1e`,
  },
  {
    id: "supabase",
    name: "Supabase Schema",
    description: "Live DB schema gives AI accurate table/column knowledge",
    icon: Database,
    color: "bg-emerald-500/15 text-emerald-400",
    docsUrl: "https://supabase.com/docs/reference/javascript",
    contextType: "DB schema",
    configKey: "NEXT_PUBLIC_SUPABASE_URL",
    sampleContext: `## Supabase Schema Context (injected)
Tables: profiles, projects, project_files, messages, collaborators, deployments
profiles: id uuid, email text, plan text, credits int, github_token text
projects: id uuid, user_id uuid, name text, framework text, deploy_url text
project_files: id uuid, project_id uuid, path text, content text, language text`,
  },
];

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface McpContextPanelProps {
  projectId: string;
  enabledSources?: string[]; // IDs of sources that are currently enabled
  onToggleSource?: (id: string, enabled: boolean) => void;
}

export function McpContextPanel({ projectId, enabledSources: externalEnabled, onToggleSource }: McpContextPanelProps) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(externalEnabled ?? []));
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Simulate mock context snippets per source
  const mockSnippets: Record<string, ContextSnippet> = Object.fromEntries(
    CONTEXT_SOURCES.map((s) => [
      s.id,
      {
        sourceId: s.id,
        title: `${s.name} — live context`,
        preview: s.sampleContext,
        tokenCount: Math.floor(s.sampleContext.length / 4),
      },
    ])
  );

  useEffect(() => {
    fetch(`/api/projects/${projectId}/env`)
      .then((r) => r.ok ? r.json() : { envVars: [] })
      .then((data: { envVars: Array<{ key: string }> }) => {
        const keys = new Set((data.envVars ?? []).map((e: { key: string }) => e.key));
        const conn = new Set<string>();
        for (const s of CONTEXT_SOURCES) {
          if (keys.has(s.configKey)) conn.add(s.id);
        }
        setConnected(conn);
        // Auto-enable sources that are connected
        setEnabled((prev) => {
          const next = new Set(prev);
          for (const id of conn) next.add(id);
          return next;
        });
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [projectId, refreshKey]);

  function toggleSource(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onToggleSource?.(id, !prev.has(id));
      return next;
    });
  }

  const totalTokens = [...enabled].reduce((sum, id) => {
    return sum + (mockSnippets[id]?.tokenCount ?? 0);
  }, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Loading context sources…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <MessageSquare className="w-4 h-4 text-sky-400 shrink-0" />
        <span className="text-xs font-semibold flex-1">Chat Connectors</span>
        <Button
          size="sm" variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <RefreshCw className="w-3 h-3 text-muted-foreground" />
        </Button>
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-sky-500/5 border-b border-sky-500/10 shrink-0">
        <Zap className="w-3.5 h-3.5 text-sky-400 shrink-0" />
        <p className="text-[10px] text-sky-300 flex-1">
          Enabled sources are injected into every AI prompt during building.
          {totalTokens > 0 && <span className="ml-1 text-sky-400/70">~{totalTokens} tokens/request</span>}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {CONTEXT_SOURCES.map((source) => {
            const Icon = source.icon;
            const isConnected = connected.has(source.id);
            const isEnabled = enabled.has(source.id);
            const isPreviewing = previewing === source.id;

            return (
              <div
                key={source.id}
                className={`rounded-xl border transition-all ${isEnabled ? "border-sky-500/30 bg-sky-500/5" : "border-border bg-card"}`}
              >
                {/* Row */}
                <div className="flex items-center gap-3 p-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${source.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold">{source.name}</p>
                      {isConnected
                        ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                        : <Circle className="w-2.5 h-2.5 text-muted-foreground/40" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{source.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Preview toggle */}
                    <button
                      onClick={() => setPreviewing((p) => p === source.id ? null : source.id)}
                      className="p-1 rounded"
                      title="Preview context"
                    >
                      {isPreviewing
                        ? <EyeOff className="w-3 h-3 text-muted-foreground" />
                        : <Eye className="w-3 h-3 text-muted-foreground" />}
                    </button>
                    {/* Enable toggle */}
                    <button
                      onClick={() => toggleSource(source.id)}
                      className={`w-9 h-5 rounded-full transition-colors relative ${isEnabled ? "bg-sky-500" : "bg-muted"}`}
                      aria-label={isEnabled ? "Disable context" : "Enable context"}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>

                {/* Status / warning */}
                {!isConnected && isEnabled && (
                  <div className="mx-3 mb-2 flex items-center gap-1.5 text-[9px] text-amber-400 bg-amber-500/10 rounded-lg px-2 py-1.5">
                    <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                    Not connected — add <code className="mx-0.5 bg-muted rounded px-0.5">{source.configKey}</code> in the Env panel.
                  </div>
                )}

                {/* Context preview */}
                {isPreviewing && (
                  <div className="mx-3 mb-3 rounded-lg bg-muted/40 border border-border/60 overflow-hidden">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/40 bg-muted/20">
                      <Eye className="w-2.5 h-2.5 text-muted-foreground" />
                      <span className="text-[9px] text-muted-foreground flex-1">Context preview — {source.contextType}</span>
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1">~{mockSnippets[source.id].tokenCount} tokens</Badge>
                    </div>
                    <pre className="text-[9px] text-muted-foreground/80 p-2.5 whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto">
                      {mockSnippets[source.id].preview}
                    </pre>
                  </div>
                )}

                {/* Tag */}
                {isEnabled && !isPreviewing && (
                  <div className="flex items-center gap-1.5 px-3 pb-2">
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-sky-500/30 text-sky-400">
                      {source.contextType} · ~{mockSnippets[source.id].tokenCount} tokens
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2.5 space-y-1.5 shrink-0">
        {enabled.size > 0 && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">{enabled.size} source{enabled.size !== 1 ? "s" : ""} active</span>
            <span className="text-sky-400">~{totalTokens} tokens per prompt</span>
          </div>
        )}
        <p className="text-[9px] text-muted-foreground/60 text-center">
          Context is injected at build time only — never included in deployed apps.
        </p>
      </div>
    </div>
  );
}
