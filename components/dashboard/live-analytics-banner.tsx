"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Eye, TrendingUp, Radio, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface LiveProject {
  id: string;
  name: string;
  slug?: string | null;
  activeVisitors: number;
  todayViews: number;
}

interface LiveAnalyticsBannerProps {
  projectIds: string[];
}

export function LiveAnalyticsBanner({ projectIds }: LiveAnalyticsBannerProps) {
  const supabase = createClient();
  const [liveData, setLiveData] = useState<Record<string, { active: number; today: number }>>({});
  const [totalActive, setTotalActive] = useState(0);
  const [totalToday, setTotalToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchLive = useCallback(async () => {
    if (projectIds.length === 0) { setLoading(false); return; }

    const results: Record<string, { active: number; today: number }> = {};

    await Promise.all(
      projectIds.slice(0, 10).map(async (pid) => {
        try {
          const res = await fetch(`/api/analytics/beacon?projectId=${pid}`);
          if (res.ok) {
            const { activeVisitors, todayViews } = await res.json();
            results[pid] = { active: activeVisitors ?? 0, today: todayViews ?? 0 };
          }
        } catch { /* ignore */ }
      })
    );

    setLiveData(results);
    setTotalActive(Object.values(results).reduce((s, v) => s + v.active, 0));
    setTotalToday(Object.values(results).reduce((s, v) => s + v.today, 0));
    setLastUpdated(new Date());
    setLoading(false);
  }, [projectIds]);

  // Initial load + 30s polling
  useEffect(() => {
    void fetchLive();
    const interval = setInterval(() => void fetchLive(), 30_000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  // Subscribe to app_visitors changes via Supabase Realtime for instant updates
  useEffect(() => {
    if (projectIds.length === 0) return;
    const channel = supabase
      .channel("app-visitors-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_visitors" },
        () => { void fetchLive(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [projectIds, fetchLive]);

  if (projectIds.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Radio className="w-4 h-4 text-green-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          </div>
          <span className="text-sm font-semibold">Live</span>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              updated {Math.round((Date.now() - lastUpdated.getTime()) / 1000)}s ago
            </span>
          )}
        </div>
        <button
          onClick={() => void fetchLive()}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Active right now */}
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-3.5 h-3.5 text-green-400" />
            <span className="text-[11px] text-green-400 font-medium">Active now</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {loading ? "—" : totalActive}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">across all apps</p>
        </div>

        {/* Today's pageviews */}
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Eye className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] text-blue-400 font-medium">Today's views</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {loading ? "—" : totalToday.toLocaleString()}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">since midnight</p>
        </div>
      </div>

      {/* Per-project breakdown */}
      {!loading && Object.keys(liveData).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">By project</p>
          {projectIds.slice(0, 5).map((pid) => {
            const d = liveData[pid];
            if (!d) return null;
            return (
              <div key={pid} className="flex items-center gap-2 py-1">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.active > 0 ? "bg-green-400 animate-pulse" : "bg-muted-foreground/30"}`} />
                <span className="text-[11px] text-muted-foreground font-mono truncate flex-1">{pid.slice(0, 8)}…</span>
                <span className="text-[11px] tabular-nums text-foreground font-medium">{d.active} live</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">{d.today} today</span>
              </div>
            );
          })}
        </div>
      )}

      {!loading && totalActive === 0 && totalToday === 0 && (
        <div className="text-center py-3">
          <TrendingUp className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">No visitors yet today.</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Analytics appear once users visit your deployed apps.
          </p>
        </div>
      )}
    </div>
  );
}

/** Tiny beacon script to paste into built apps (shown in project settings) */
export function getBeaconScript(projectId: string, appUrl: string): string {
  return `<!-- LifemarkAI Analytics -->
<script>
(function() {
  var pid = '${projectId}';
  var base = '${appUrl}';
  var key = sessionStorage.getItem('lmai_vid') || Math.random().toString(36).slice(2);
  sessionStorage.setItem('lmai_vid', key);
  function beacon(evt) {
    navigator.sendBeacon(base + '/api/analytics/beacon', JSON.stringify({
      projectId: pid, visitorKey: key, path: location.pathname,
      referrer: document.referrer, event: evt
    }));
  }
  beacon('pageview');
  setInterval(function() { beacon('heartbeat'); }, 25000);
  window.addEventListener('pagehide', function() { beacon('leave'); });
})();
</script>`;
}
