// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox, Check, CheckCheck, Trash2, Loader2, Filter,
  ExternalLink, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import type { Notification } from "@/types/database";

const ICONS: Record<string, string> = {
  deploy_success: "🚀",
  deploy_failed: "❌",
  credit_low: "⚡",
  invite: "👥",
  system: "ℹ️",
  ai_done: "✨",
  comment: "💬",
  feedback: "📨",
};

const TYPE_LABELS: Record<string, string> = {
  deploy_success: "Deployment",
  deploy_failed: "Deployment",
  credit_low: "Billing",
  invite: "Invitation",
  system: "System",
  ai_done: "AI",
  comment: "Comments",
  feedback: "Feedback",
};

type FilterMode = "all" | "unread" | "invite" | "deploy" | "system";

export function InboxPage({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=100");
      if (res.ok) {
        const data = await res.json() as { notifications: Notification[] };
        setItems(data.notifications ?? []);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markRead(id: string) {
    setBusy(id);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", ids: [id] }),
      });
      setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } finally { setBusy(null); }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/notifications?id=${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((n) => n.id !== id));
    } finally { setBusy(null); }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast({ title: "Marked all as read" });
    } finally { setMarkingAll(false); }
  }

  const filtered = items.filter((n) => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.is_read;
    if (filter === "invite") return n.type === "invite";
    if (filter === "deploy") return n.type?.startsWith("deploy");
    if (filter === "system") return n.type === "system";
    return true;
  });
  const unreadCount = items.filter((n) => !n.is_read).length;

  const FILTERS: { id: FilterMode; label: string; count?: number }[] = [
    { id: "all", label: "All", count: items.length },
    { id: "unread", label: "Unread", count: unreadCount },
    { id: "invite", label: "Invites", count: items.filter((n) => n.type === "invite").length },
    { id: "deploy", label: "Deploys", count: items.filter((n) => n.type?.startsWith("deploy")).length },
    { id: "system", label: "System", count: items.filter((n) => n.type === "system").length },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Inbox className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Inbox</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {items.length === 0
                ? "Nothing here yet — invites, deploys, and AI updates will arrive here."
                : `${unreadCount} unread of ${items.length} total notification${items.length === 1 ? "" : "s"}.`}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={markAllRead}
          disabled={markingAll || unreadCount === 0}
          className="gap-1.5"
        >
          {markingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
          Mark all read
        </Button>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
              filter === f.id
                ? "border-violet-500/50 bg-violet-500/10 text-violet-200"
                : "border-border text-muted-foreground hover:text-foreground hover:border-violet-500/30"
            }`}
          >
            {f.label}
            {typeof f.count === "number" && f.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                filter === f.id ? "bg-violet-500/20 text-violet-100" : "bg-muted text-muted-foreground"
              }`}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="w-8 h-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {filter === "unread" ? "No unread notifications" : "No notifications match this filter"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((n) => {
              const icon = ICONS[n.type ?? "system"] ?? "🔔";
              const typeLabel = TYPE_LABELS[n.type ?? "system"] ?? "Notification";
              const linkProps = n.link
                ? { as: Link as any, href: n.link, target: n.link.startsWith("http") ? "_blank" : undefined }
                : {};
              const Wrapper: any = n.link ? Link : "div";
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={`group flex items-start gap-3 p-4 rounded-lg border transition-all ${
                    n.is_read
                      ? "border-border bg-card/30 hover:bg-card/60"
                      : "border-violet-500/30 bg-violet-500/[0.06] hover:bg-violet-500/[0.10]"
                  }`}
                >
                  <div className="text-xl shrink-0 mt-0.5" aria-hidden>{icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground uppercase tracking-wider font-medium">
                        {typeLabel}
                      </span>
                      {!n.is_read && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-medium">
                          New
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/60 ml-auto">{formatDate(n.created_at)}</span>
                    </div>
                    <h3 className="text-sm font-medium leading-snug">{n.title}</h3>
                    {n.body && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>}
                    {n.link && (
                      <Wrapper
                        {...linkProps}
                        className="inline-flex items-center gap-1 mt-2 text-[11px] text-violet-300 hover:text-violet-200 transition-colors"
                      >
                        Open
                        <ExternalLink className="w-2.5 h-2.5" />
                      </Wrapper>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {!n.is_read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7"
                        onClick={() => void markRead(n.id)}
                        disabled={busy === n.id}
                        title="Mark as read"
                      >
                        {busy === n.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => void remove(n.id)}
                      disabled={busy === n.id}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
