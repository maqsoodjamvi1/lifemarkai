"use client";

/**
 * Per-project skill visibility panel.
 *
 * Lets the user opt a workspace skill OUT of auto-attachment for a specific
 * project. The matcher in lib/ai/skill-matcher.ts is global to the workspace,
 * so without this control a "Add Stripe checkout" skill would fire even on a
 * marketing site that has no commerce surface.
 *
 * Storage: projects.disabled_skill_ids (JSONB array, migration 055). Updates
 * go through the existing PATCH /api/projects/[id] endpoint — no new API.
 *
 * Mount: import wherever per-project settings live (project settings panel
 * is the obvious home). Self-contained — no provider context required beyond
 * the supplied projectId.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WorkspaceSkill {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
}

interface ProjectSkillVisibilityPanelProps {
  projectId: string;
}

export function ProjectSkillVisibilityPanel({ projectId }: ProjectSkillVisibilityPanelProps) {
  const [skills, setSkills] = useState<WorkspaceSkill[]>([]);
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load workspace skills and the current project's disabled list in parallel.
      const [skillsRes, projectRes] = await Promise.all([
        fetch("/api/skills"),
        fetch(`/api/projects/${projectId}`),
      ]);
      if (skillsRes.ok) {
        const data = await skillsRes.json() as { custom?: WorkspaceSkill[] };
        setSkills(data.custom ?? []);
      }
      if (projectRes.ok) {
        const project = await projectRes.json() as { disabled_skill_ids?: string[] | null };
        setDisabledIds(new Set(project.disabled_skill_ids ?? []));
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(skillId: string) {
    const next = new Set(disabledIds);
    if (next.has(skillId)) next.delete(skillId);
    else next.add(skillId);

    // Optimistic update + per-row busy state.
    const prev = disabledIds;
    setDisabledIds(next);
    setBusyIds((b) => new Set(b).add(skillId));

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled_skill_ids: Array.from(next) }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch (err) {
      setDisabledIds(prev);
      toast({
        title: "Couldn't save",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusyIds((b) => {
        const n = new Set(b);
        n.delete(skillId);
        return n;
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-4 text-center">
        <Sparkles className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">No workspace skills yet.</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          Save a useful AI answer as a skill (⚡ on any assistant message) — it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
        <p className="text-xs font-semibold">Skills for this project</p>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {skills.length - disabledIds.size}/{skills.length} enabled
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/70 -mt-1">
        Disabled skills won&apos;t auto-attach to prompts in this project. Toggling here doesn&apos;t affect other projects.
      </p>
      <div className="rounded-xl border border-border/60 divide-y divide-border/40">
        {skills.map((s) => {
          const enabled = !disabledIds.has(s.id);
          const busy = busyIds.has(s.id);
          return (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2">
              <span className="text-base flex-shrink-0">{s.icon ?? "⚡"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{s.name}</p>
                {s.description && (
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{s.description}</p>
                )}
              </div>
              <button
                onClick={() => void toggle(s.id)}
                disabled={busy}
                className={`h-7 px-2.5 inline-flex items-center gap-1 text-[11px] rounded-lg border transition-colors disabled:opacity-50 ${
                  enabled
                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15"
                    : "border-border/60 text-muted-foreground hover:bg-muted/40"
                }`}
                title={enabled ? "Disable for this project" : "Enable for this project"}
              >
                {busy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : enabled ? (
                  <><Eye className="w-3 h-3" /> Enabled</>
                ) : (
                  <><EyeOff className="w-3 h-3" /> Disabled</>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
