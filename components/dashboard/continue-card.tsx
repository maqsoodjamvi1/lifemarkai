"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Clock, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Project {
  id: string;
  name: string;
  framework: string;
  updated_at: string;
  description?: string | null;
}

const FRAMEWORK_COLORS: Record<string, string> = {
  "Next.js": "text-white border-white/20",
  "React":   "text-[#61dafb] border-[#61dafb]/30",
  "Vue":     "text-[#42b883] border-[#42b883]/30",
  "Svelte":  "text-[#ff3e00] border-[#ff3e00]/30",
  "Remix":   "text-blue-400 border-blue-400/30",
  "Astro":   "text-orange-400 border-orange-400/30",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface ContinueCardProps {
  projects: Project[];
}

export function ContinueCard({ projects }: ContinueCardProps) {
  const router = useRouter();

  if (!projects || projects.length === 0) return null;

  // Most recently updated project
  const recent = [...projects].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )[0];

  return (
    <div className="relative overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/5 via-violet-500/[0.03] to-transparent px-5 py-4">
      {/* Subtle glow */}
      <div className="pointer-events-none absolute -left-10 top-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-violet-500/10 blur-2xl" />

      <div className="relative flex items-center gap-4">
        {/* Icon */}
        <div className="shrink-0 w-9 h-9 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
          <Zap className="w-4 h-4 text-violet-400" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-muted-foreground mb-0.5 font-medium uppercase tracking-wider">
            Continue where you left off
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {recent.name}
            </span>
            <Badge
              variant="outline"
              className={"text-[10px] py-0 " + (FRAMEWORK_COLORS[recent.framework] ?? "")}
            >
              {recent.framework}
            </Badge>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {timeAgo(recent.updated_at)}
            </span>
          </div>
          {recent.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
              {recent.description}
            </p>
          )}
        </div>

        {/* CTA */}
        <Button
          size="sm"
          className="shrink-0 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={() => router.push(`/editor/${recent.id}`)}
        >
          Open editor
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
