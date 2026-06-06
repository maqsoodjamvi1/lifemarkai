"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Pin, Star, Rocket, Code2, Box, Wind, Zap,
  Globe, Clock, ExternalLink,
} from "lucide-react";
import type { Project } from "@/types/database";

const FRAMEWORK_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  react:  { label: "React",     color: "text-cyan-400",   icon: Code2 },
  next:   { label: "Next.js",   color: "text-slate-300",  icon: Zap   },
  vue:    { label: "Vue 3",     color: "text-green-400",  icon: Box   },
  svelte: { label: "SvelteKit", color: "text-orange-400", icon: Wind  },
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

interface PinnedRailProps {
  projects: Project[];
}

export function PinnedRail({ projects }: PinnedRailProps) {
  const router = useRouter();
  const [localUnpin, setLocalUnpin] = useState<Set<string>>(new Set());

  const pinned = projects.filter(
    (p) => (p.is_starred ?? false) && !localUnpin.has(p.id)
  ).slice(0, 6);

  if (pinned.length === 0) return null;

  async function handleUnpin(e: React.MouseEvent, projectId: string) {
    e.stopPropagation();
    // Optimistic
    setLocalUnpin((prev) => new Set([...prev, projectId]));
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_starred: false }),
      });
    } catch {
      // revert
      setLocalUnpin((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <Pin className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Pinned
        </span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        {pinned.map((project, idx) => {
          const fw = FRAMEWORK_CONFIG[project.framework ?? "react"] ?? FRAMEWORK_CONFIG.react;
          const FwIcon = fw.icon;
          const isLive = Boolean(project.deployed_url);

          return (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => router.push(`/editor/${project.id}`)}
              className="group relative flex-shrink-0 w-52 rounded-xl border border-border bg-card hover:bg-accent/40 hover:border-border/80 transition-all cursor-pointer p-3"
            >
              {/* Unpin button */}
              <button
                onClick={(e) => void handleUnpin(e, project.id)}
                title="Unpin"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <Star className="w-3 h-3 fill-current text-amber-400" />
              </button>

              {/* Framework icon + name */}
              <div className="flex items-center gap-2 mb-2 pr-5">
                <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                  <FwIcon className={`w-3.5 h-3.5 ${fw.color}`} />
                </div>
                <span className="text-xs font-semibold truncate">{project.name}</span>
              </div>

              {/* Footer meta */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{timeAgo(project.updated_at)}</span>
                </div>
                {isLive ? (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <Globe className="w-2.5 h-2.5" />
                    <span>Live</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <ExternalLink className="w-2.5 h-2.5" />
                    <span>Open</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
