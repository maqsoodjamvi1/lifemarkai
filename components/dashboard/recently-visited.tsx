"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { History, Code2, Zap, Box, Wind } from "lucide-react";
import { getRecentProjects, type RecentProject } from "@/hooks/use-recent-projects";
import type { Project } from "@/types/database";

const FW_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  react:  { color: "text-cyan-400",   icon: Code2 },
  next:   { color: "text-slate-300",  icon: Zap   },
  vue:    { color: "text-green-400",  icon: Box   },
  svelte: { color: "text-orange-400", icon: Wind  },
};

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface RecentlyVisitedProps {
  /** Full project list — used to skip pinned projects and enrich data */
  projects: Project[];
}

export function RecentlyVisited({ projects }: RecentlyVisitedProps) {
  const router = useRouter();
  const [recents, setRecents] = useState<RecentProject[]>([]);

  useEffect(() => {
    // Read after mount so we never mismatch SSR / client
    const pinnedIds = new Set(projects.filter((p) => p.is_starred).map((p) => p.id));
    const all = getRecentProjects().filter((r) => !pinnedIds.has(r.id));
    setRecents(all.slice(0, 4));
  }, [projects]);

  if (recents.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <History className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Recently visited
        </span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        {recents.map((r, idx) => {
          const fw = FW_CONFIG[r.framework ?? "react"] ?? FW_CONFIG.react;
          const FwIcon = fw.icon;
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => router.push(`/editor/${r.id}`)}
              className="group flex-shrink-0 w-44 rounded-xl border border-border bg-card hover:bg-accent/40 hover:border-border/80 transition-all cursor-pointer p-3"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                  <FwIcon className={`w-3 h-3 ${fw.color}`} />
                </div>
                <span className="text-xs font-semibold truncate">{r.name}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{timeAgo(r.visitedAt)}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
