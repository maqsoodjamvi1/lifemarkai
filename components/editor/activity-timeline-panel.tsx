"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity, MessageSquare, GitCommit, Rocket, FileText,
  Plus, Pencil, Trash2, Eye, Zap, RefreshCw, Loader2,
  ChevronDown, ChevronUp, User, Clock, Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ActivityTimelinePanelProps {
  projectId: string;
}

type EventType =
  | "ai_chat"
  | "ai_agent"
  | "deploy"
  | "file_create"
  | "file_edit"
  | "file_delete"
  | "snapshot"
  | "commit"
  | "view"
  | "settings";

interface TimelineEvent {
  id: string;
  type: EventType;
  title: string;
  detail?: string;
  actor?: string;
  created_at: string;
  meta?: Record<string, unknown>;
}

const EVENT_CONFIG: Record<EventType, { icon: React.ElementType; color: string; bg: string }> = {
  ai_chat:     { icon: MessageSquare, color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
  ai_agent:    { icon: Zap,           color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/20" },
  deploy:      { icon: Rocket,        color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  file_create: { icon: Plus,          color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/20" },
  file_edit:   { icon: Pencil,        color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/20" },
  file_delete: { icon: Trash2,        color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
  snapshot:    { icon: GitCommit,     color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20" },
  commit:      { icon: GitCommit,     color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/20" },
  view:        { icon: Eye,           color: "text-slate-400",   bg: "bg-slate-500/10 border-slate-500/20" },
  settings:    { icon: FileText,      color: "text-rose-400",    bg: "bg-rose-500/10 border-rose-500/20" },
};

const ALL_TYPES: EventType[] = ["ai_chat", "ai_agent", "deploy", "file_create", "file_edit", "file_delete", "snapshot", "commit", "view", "settings"];

const TYPE_LABELS: Record<EventType, string> = {
  ai_chat: "AI Chat", ai_agent: "Agent", deploy: "Deploy",
  file_create: "Created", file_edit: "Edited", file_delete: "Deleted",
  snapshot: "Snapshot", commit: "Commit", view: "View", settings: "Settings",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function groupByDate(events: TimelineEvent[]): { label: string; events: TimelineEvent[] }[] {
  const groups: Map<string, TimelineEvent[]> = new Map();
  for (const ev of events) {
    const d = new Date(ev.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    let label: string;
    if (d.toDateString() === today.toDateString()) label = "Today";
    else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(ev);
  }
  return Array.from(groups.entries()).map(([label, events]) => ({ label, events }));
}

export function ActivityTimelinePanel({ projectId }: ActivityTimelinePanelProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<EventType>>(new Set(ALL_TYPES));
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 30;

  const load = useCallback(async (reset = false) => {
    if (reset) { setLoading(true); setPage(0); }
    else setRefreshing(true);
    try {
      const offset = reset ? 0 : page * PAGE_SIZE;
      const res = await fetch(`/api/projects/${projectId}/activity?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) return;
      const data = await res.json() as { events: TimelineEvent[]; total: number };
      setEvents(reset ? (data.events ?? []) : (prev) => [...prev, ...(data.events ?? [])]);
      setHasMore((data.events?.length ?? 0) === PAGE_SIZE);
      if (!reset) setPage((p) => p + 1);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [projectId, page]);

  useEffect(() => { load(true); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleFilter(type: EventType) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      return next;
    });
  }

  function toggleAllFilters() {
    setActiveFilters((prev) => prev.size === ALL_TYPES.length ? new Set() : new Set(ALL_TYPES));
  }

  const filtered = events.filter((e) => activeFilters.has(e.type));
  const groups = groupByDate(filtered);

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-blue-400" />
          <h2 className="font-semibold text-foreground">Activity Timeline</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
            {filtered.length} events
          </Badge>
          <button
            onClick={() => load(true)}
            className="ml-auto text-muted-foreground hover:text-foreground p-0.5 rounded"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Chronological event feed for this project</p>
      </div>

      {/* Filter bar */}
      <div className="border-b border-border">
        <button
          onClick={() => setFilterOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Filter className="w-3 h-3" />
            Filter by type
            {activeFilters.size < ALL_TYPES.length && (
              <Badge variant="outline" className="text-[9px] h-4 px-1 border-blue-500/40 text-blue-400">
                {activeFilters.size}/{ALL_TYPES.length}
              </Badge>
            )}
          </span>
          {filterOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {filterOpen && (
          <div className="px-3 pb-2 space-y-1.5">
            <button
              onClick={toggleAllFilters}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              {activeFilters.size === ALL_TYPES.length ? "Deselect all" : "Select all"}
            </button>
            <div className="flex gap-1 flex-wrap">
              {ALL_TYPES.map((type) => {
                const cfg = EVENT_CONFIG[type];
                const active = activeFilters.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleFilter(type)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      active ? `${cfg.bg} ${cfg.color}` : "border-border text-muted-foreground"
                    }`}
                  >
                    {TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 px-4 text-center">
            <Activity className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground">Events will appear here as you use the editor — AI chats, deploys, file changes, and more.</p>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {groups.map(({ label, events: groupEvents }) => (
              <div key={label}>
                {/* Date group header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-[10px] text-muted-foreground">{groupEvents.length}</span>
                </div>

                {/* Events */}
                <div className="relative pl-5">
                  {/* Vertical line */}
                  <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border/40" />

                  <div className="space-y-2">
                    {groupEvents.map((ev) => {
                      const cfg = EVENT_CONFIG[ev.type] ?? EVENT_CONFIG.settings;
                      const Icon = cfg.icon;
                      const isExpanded = expandedId === ev.id;

                      return (
                        <div key={ev.id} className="relative">
                          {/* Dot on timeline */}
                          <div className={`absolute -left-[17px] top-2.5 w-2.5 h-2.5 rounded-full border ${cfg.bg} flex items-center justify-center`}>
                            <div className={`w-1 h-1 rounded-full ${cfg.color.replace("text-", "bg-")}`} />
                          </div>

                          <button
                            onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                            className="w-full text-left rounded-lg border border-border/60 bg-muted/10 hover:bg-muted/20 transition-colors overflow-hidden"
                          >
                            <div className="flex items-start gap-2 px-2.5 py-2">
                              <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{ev.title}</p>
                                {ev.detail && !isExpanded && (
                                  <p className="text-[10px] text-muted-foreground truncate">{ev.detail}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5" />{timeAgo(ev.created_at)}
                                </span>
                                {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="border-t border-border/50 px-2.5 py-2 bg-muted/5 space-y-1.5">
                                {ev.detail && (
                                  <p className="text-[11px] text-foreground/80 leading-relaxed">{ev.detail}</p>
                                )}
                                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                  <Badge variant="outline" className={`text-[9px] h-4 px-1 ${cfg.bg} ${cfg.color}`}>
                                    {TYPE_LABELS[ev.type]}
                                  </Badge>
                                  {ev.actor && (
                                    <span className="flex items-center gap-1">
                                      <User className="w-2.5 h-2.5" />{ev.actor}
                                    </span>
                                  )}
                                  <span>{new Date(ev.created_at).toLocaleString()}</span>
                                </div>
                                {ev.meta && Object.keys(ev.meta).length > 0 && (
                                  <div className="rounded bg-muted/30 p-1.5">
                                    <pre className="text-[9px] font-mono text-muted-foreground whitespace-pre-wrap">
                                      {JSON.stringify(ev.meta, null, 2).slice(0, 300)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            {hasMore && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs gap-1.5"
                onClick={() => load(false)}
                disabled={refreshing}
              >
                {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Load more
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
