"use client";

import { useRouter } from "next/navigation";
import { LayoutTemplate, Zap, Star, ChevronRight } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  fork_count: number | null;
  tags: string[] | null;
  preview_url: string | null;
}

const FRAMEWORK_COLOR: Record<string, string> = {
  "next.js":    "bg-black/80 text-white",
  react:        "bg-[#61dafb]/20 text-[#61dafb]",
  vue:          "bg-[#42b883]/20 text-[#42b883]",
  svelte:       "bg-[#ff3e00]/20 text-[#ff3e00]",
  astro:        "bg-[#ff5d01]/20 text-[#ff5d01]",
  nuxt:         "bg-[#00dc82]/20 text-[#00dc82]",
  remix:        "bg-blue-500/20 text-blue-400",
  vanilla:      "bg-yellow-500/20 text-yellow-400",
};

function frameworkColor(fw: string) {
  return FRAMEWORK_COLOR[fw?.toLowerCase()] ?? "bg-muted text-muted-foreground";
}

interface FeaturedTemplatesProps {
  templates: Template[];
  projectCount: number;
}

export function FeaturedTemplates({ templates, projectCount }: FeaturedTemplatesProps) {
  const router = useRouter();

  // Only show when user has few projects
  if (templates.length === 0 || projectCount >= 6) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-foreground">Start from a template</h2>
        </div>
        <button
          onClick={() => router.push("/templates")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group"
        >
          View all
          <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Horizontally scrollable row */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {templates.map((t) => (
          <div
            key={t.id}
            className="flex-none w-52 rounded-xl border border-border/60 bg-card/50 hover:bg-card hover:border-border hover:shadow-sm transition-all group cursor-pointer"
            onClick={() => router.push(`/templates?use=${t.id}`)}
          >
            {/* Header accent */}
            <div className="h-1.5 rounded-t-xl bg-gradient-to-r from-violet-500/40 to-purple-500/20" />

            <div className="p-3 space-y-2.5">
              {/* Name + framework */}
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-foreground leading-tight line-clamp-2">
                  {t.name}
                </span>
                <span
                  className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${frameworkColor(t.framework)}`}
                >
                  {t.framework}
                </span>
              </div>

              {/* Description */}
              {t.description && (
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                  {t.description}
                </p>
              )}

              {/* Footer: fork count + use button */}
              <div className="flex items-center justify-between pt-0.5">
                {(t.fork_count ?? 0) > 0 ? (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                    <Star className="w-2.5 h-2.5" />
                    {t.fork_count}
                  </span>
                ) : (
                  <span />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); router.push(`/templates?use=${t.id}`); }}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300 transition-colors"
                >
                  <Zap className="w-2.5 h-2.5" />
                  Use
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* "Browse all" card at the end */}
        <div
          className="flex-none w-36 rounded-xl border border-dashed border-border/50 hover:border-border flex flex-col items-center justify-center gap-2 py-6 cursor-pointer text-muted-foreground hover:text-foreground transition-colors group"
          onClick={() => router.push("/templates")}
        >
          <LayoutTemplate className="w-5 h-5 opacity-40 group-hover:opacity-70 transition-opacity" />
          <span className="text-xs text-center leading-tight px-2">Browse all templates</span>
        </div>
      </div>
    </div>
  );
}
