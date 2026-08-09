
/**
 * NotificationsBell — Lovable-parity top-bar notifications (aria "Notifications alt+T").
 *
 * Popover over the existing unified activity feed (/api/projects/[id]/activity).
 * Unread state = newest event newer than the per-project last-seen timestamp
 * (localStorage). Alt+T toggles, matching the captured shortcut.
 */

import * as React from "react";
import { Bell,Rocket,Bot,GitCommit,ShieldAlert,MessageSquare,Activity } from "lucide-react";
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface FeedEvent {
  id: string;
  type: string;
  title: string;
  detail?: string;
  created_at: string;
}

function iconFor(type: string) {
  if (type.includes("deploy")) return Rocket;
  if (type.includes("ai") || type.includes("chat")) return Bot;
  if (type.includes("commit") || type.includes("git")) return GitCommit;
  if (type.includes("security") || type.includes("health")) return ShieldAlert;
  if (type.includes("comment")) return MessageSquare;
  return Activity;
}

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationsBell({ projectId, className }: { projectId: string; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [events, setEvents] = React.useState<FeedEvent[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [hasUnread, setHasUnread] = React.useState(false);
  const seenKey = `lifemark-notif-seen-${projectId}`;
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/activity?limit=15`);
      if (!res.ok || !mountedRef.current) return;
      const data = await res.json();
      if (!mountedRef.current) return;
      const list: FeedEvent[] = Array.isArray(data) ? data : data.events ?? [];
      setEvents(list);
      const newest = list[0]?.created_at;
      if (newest) {
        let seen = 0;
        try { seen = Number(localStorage.getItem(seenKey) ?? 0); } catch { /* private mode */ }
        setHasUnread(new Date(newest).getTime() > seen);
      }
    } catch {
      /* network — leave state as-is */
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectId, seenKey]);

  // Initial unread probe (cheap: single fetch on mount).
  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function markSeen() {
    try { localStorage.setItem(seenKey, String(Date.now())); } catch { /* private mode */ }
    setHasUnread(false);
  }

  // Lovable dump: alt+T toggles notifications.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        setOpen((v) => {
          const next = !v;
          if (next) {
            void refresh();
            markSeen();
          }
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          void refresh();
          markSeen();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Notifications alt+T"
          title="Notifications (Alt+T)"
          className={cn(
            "relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full",
            "text-[var(--fg-tertiary)] transition-colors hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)]",
            className,
          )}
        >
          <Bell className="size-4" />
          {hasUnread && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#2F6FED]" aria-hidden />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 text-xs font-medium text-[var(--fg-primary)] border-b border-[color:var(--border-translucent)]">
          Notifications
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {loading && events.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-[var(--fg-tertiary)]">Loading…</div>
          )}
          {!loading && events.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-[var(--fg-tertiary)]">
              No activity yet — build something!
            </div>
          )}
          {events.map((ev) => {
            const Icon = iconFor(ev.type);
            return (
              <div key={ev.id} className="flex items-start gap-2.5 rounded-[var(--radius-2)] px-2.5 py-2 hover:bg-[var(--bg-muted)]/60 transition-colors">
                <Icon className="mt-0.5 size-3.5 shrink-0 text-[var(--fg-tertiary)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-[var(--fg-primary)]">{ev.title}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-[var(--fg-quaternary)]">{relTime(ev.created_at)}</span>
                  </div>
                  {ev.detail && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--fg-tertiary)]">{ev.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
