"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FolderOpen, Globe, Zap, FileCode2 } from "lucide-react";
import type { Project } from "@/types/database";

interface StatsCardsProps {
  projects: (Project & { project_files?: { count: number }[] })[];
  credits: number;
}

function AnimatedCount({ to }: { to: number }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const duration = 600;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(to * eased));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [to]);

  return <span>{display.toLocaleString()}</span>;
}

export function StatsCards({ projects, credits }: StatsCardsProps) {
  const totalProjects = projects.length;
  const liveProjects = projects.filter((p) => p.deployed_url).length;

  const totalFiles = projects.reduce((sum, p) => {
    const count = Array.isArray(p.project_files)
      ? (p.project_files[0] as { count: number } | undefined)?.count ?? 0
      : 0;
    return sum + Number(count);
  }, 0);

  const stats = [
    { label: "Total Projects", value: totalProjects, icon: FolderOpen, color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
    { label: "Live Apps",      value: liveProjects,  icon: Globe,       color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    { label: "Credits Left",   value: credits,        icon: Zap,         color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
    { label: "Total Files",    value: totalFiles,     icon: FileCode2,   color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.3 }}
          className={`relative overflow-hidden p-4 rounded-xl bg-card border ${stat.border} hover:border-opacity-60 transition-colors`}
        >
          <stat.icon
            className={`absolute -right-2 -bottom-2 w-14 h-14 ${stat.color} opacity-[0.07]`}
          />
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {stat.label}
            </span>
            <div className={`w-7 h-7 rounded-lg ${stat.bg} flex items-center justify-center`}>
              <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
            </div>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${stat.color}`}>
            <AnimatedCount to={stat.value} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
