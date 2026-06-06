"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Sparkles, Rocket, GitCommit, FolderPlus, Clock, RefreshCw, Loader2,
} from "lucide-react";
import type { ActivityEvent } from "@/app/api/activity/route";

const EVENT_CONFIG: Record<
  ActivityEvent["type"],
  { icon: React.ElementType; color: string; bg: string }
> = {
  generation: {
    icon: Sparkles,
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
  },
  deploy: {
    icon: Rocket,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  commit: {
    icon: GitCommit,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  project_created: {
    icon: FolderPlus,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return "just now";
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const router = useRouter();

  async function fetchEvents() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/activity");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchEvents(); }, []);

  if (!loading && !error && events.length === 0) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Recent Activity</span>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Refresh
        </button>
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-7 h-7 rounded-lg bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2.5 bg-muted rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-muted-foreground">
          Could not load activity.{" "}
          <button onClick={fetchEvents} className="underline hover:text-foreground">
            Retry
          </button>
        </p>
      )}

      {!loading && !error && (
        <div className="space-y-1.5">
          {events.map((event, idx) => {
            const cfg = EVENT_CONFIG[event.type];
            const Icon = cfg.icon;
            return (
              <motion.button
                key={event.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
                onClick={() => router.push(`/editor/${event.projectId}`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/60 transition-colors group text-left"
              >
                {/* Icon badge */}
                <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate leading-snug group-hover:text-foreground transition-colors">
                    {event.description}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    <span className="font-medium">{event.projectName}</span>
                    {" · "}
                    {relativeTime(event.createdAt)}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
