"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, User, GitCommit, Rocket, FileCode, Zap,
  ChevronDown, ChevronUp, Clock, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Message, Deployment } from "@/types/database";

interface ActivityItem {
  id: string;
  type: "message_user" | "message_ai" | "deployment" | "file_change" | "credit_deduct";
  title: string;
  detail?: string;
  timestamp: string;
  meta?: Record<string, string | number>;
}

interface ActivityFeedProps {
  projectId: string;
  className?: string;
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function itemFromMessage(msg: Message): ActivityItem {
  const isUser = msg.role === "user";
  return {
    id: msg.id,
    type: isUser ? "message_user" : "message_ai",
    title: isUser
      ? msg.content.slice(0, 72) + (msg.content.length > 72 ? "…" : "")
      : `AI responded (${msg.mode ?? "chat"} mode)${msg.tokens_used ? ` · ${msg.tokens_used} tokens` : ""}`,
    detail: isUser ? undefined : msg.content.slice(0, 120) + (msg.content.length > 120 ? "…" : ""),
    timestamp: msg.created_at,
    meta: msg.model ? { model: msg.model } : undefined,
  };
}

function itemFromDeployment(dep: Deployment): ActivityItem {
  return {
    id: dep.id,
    type: "deployment",
    title: dep.status === "live"
      ? `Deployed to ${dep.url ?? "production"}`
      : `Deployment ${dep.status}`,
    detail: dep.url ?? undefined,
    timestamp: dep.deployed_at ?? dep.created_at,
    meta: { provider: dep.provider },
  };
}

const ICON_MAP: Record<ActivityItem["type"], React.ElementType> = {
  message_user: User,
  message_ai: Bot,
  deployment: Rocket,
  file_change: FileCode,
  credit_deduct: Zap,
};

const COLOR_MAP: Record<ActivityItem["type"], string> = {
  message_user: "bg-primary text-primary-foreground",
  message_ai: "bg-gradient-to-br from-violet-500 to-blue-500 text-white",
  deployment: "bg-green-500/20 text-green-400 border border-green-500/30",
  file_change: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  credit_deduct: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
};

export function ActivityFeed({ projectId, className = "" }: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  async function load() {
    setLoading(true);
    const supabase = createClient();

    const [msgRes, depRes] = await Promise.all([
      (supabase as any)
        .from("messages")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50),
      (supabase as any)
        .from("deployments")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const msgItems = (msgRes.data ?? []).map(itemFromMessage);
    const depItems = (depRes.data ?? []).map(itemFromDeployment);

    const all = [...msgItems, ...depItems].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    setItems(all);
    setLoading(false);
  }

  useEffect(() => {
    load();

    // Subscribe to new messages in realtime
    const supabase = createClient();
    const channel = supabase
      .channel(`activity:${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const newItem = itemFromMessage(payload.new as Message);
          setItems((prev) => [newItem, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deployments", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const newItem = itemFromDeployment(payload.new as Deployment);
          setItems((prev) => {
            const filtered = prev.filter((i) => i.id !== newItem.id);
            return [newItem, ...filtered].sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const visible = showAll ? items : items.slice(0, 12);

  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <GitCommit className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Activity</span>
          {items.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {items.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {loading ? (
          <div className="space-y-2 pt-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-2.5 animate-pulse">
                <div className="w-6 h-6 rounded-full bg-muted shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-2.5 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GitCommit className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start chatting with AI to see your history here
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visible.map((item, i) => {
              const Icon = ICON_MAP[item.type];
              const colors = COLOR_MAP[item.type];
              const isExpanded = expanded.has(item.id);
              const hasDetail = !!item.detail;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="flex gap-2.5 group"
                >
                  {/* Icon */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${colors}`}>
                    <Icon className="w-3 h-3" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={`flex items-start justify-between gap-1 ${hasDetail ? "cursor-pointer" : ""}`}
                      onClick={() => hasDetail && toggleExpand(item.id)}
                    >
                      <p className="text-xs leading-relaxed text-foreground/80 flex-1">
                        {item.title}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {relativeTime(item.timestamp)}
                        </span>
                        {hasDetail && (
                          isExpanded
                            ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                            : <ChevronDown className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    <AnimatePresence>
                      {isExpanded && item.detail && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed border-l-2 border-border pl-2">
                            {item.detail}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Meta badges */}
                    {item.meta && (
                      <div className="flex gap-1 mt-0.5">
                        {Object.entries(item.meta).map(([k, v]) => (
                          <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {v}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Separator line */}
                    {i < visible.length - 1 && (
                      <div className="mt-1.5 ml-[-22px] border-l border-border/40 h-3" />
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {/* Show more */}
        {!showAll && items.length > 12 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors"
          >
            Show {items.length - 12} more events
          </button>
        )}
      </div>
    </div>
  );
}
