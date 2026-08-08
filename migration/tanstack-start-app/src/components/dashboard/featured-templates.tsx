import { Link,useNavigate } from "@tanstack/react-router";
import { ChevronRight,LayoutTemplate,Star,Zap } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  fork_count: number | null;
  preview_url: string | null;
}

interface FeaturedTemplatesProps {
  templates: Template[];
  projectCount: number;
}

export function FeaturedTemplates({ templates, projectCount }: FeaturedTemplatesProps) {
  const navigate = useNavigate();

  if (templates.length === 0 || projectCount >= 6) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-foreground">Start from a template</h2>
        </div>
        <Link
          to="/templates"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className="flex-none w-52 rounded-xl border border-border/60 bg-card/50 hover:bg-card hover:border-border text-left transition-all"
            onClick={() => void navigate({ to: "/templates", search: { category: "All" } })}
          >
            <div className="h-1.5 rounded-t-xl bg-violet-500/40" />
            <div className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold line-clamp-2">{t.name}</span>
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {t.category}
                </span>
              </div>
              {t.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-2">{t.description}</p>
              )}
              <div className="flex items-center justify-between pt-0.5">
                {(t.fork_count ?? 0) > 0 ? (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                    <Star className="w-2.5 h-2.5" />
                    {t.fork_count}
                  </span>
                ) : (
                  <span />
                )}
                <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-violet-500/10 text-violet-400">
                  <Zap className="w-2.5 h-2.5" />
                  Use
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
