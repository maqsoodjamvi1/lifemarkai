"use client";

/**
 * Design Systems panel.
 *
 * Surfaces /api/design-systems (migration 050). Two roles:
 *
 *   1. THIS project as a Design System.
 *      Toggle marks the project as a DS, which:
 *        • flips projects.is_design_system,
 *        • seeds .lovable/system.md and .lovable/rules/*.md if missing,
 *        • lets other projects connect to it as consumers.
 *
 *   2. THIS project as a Consumer.
 *      Connect / disconnect DS-marked projects from this workspace. The
 *      connected DS folder is auto-injected into the AI system prompt (see
 *      app/api/ai/chat/route.ts → "Connected Design Systems" block).
 *
 * No external surfaces — the panel reads/writes everything via the existing
 * API. Mount under "designsystem" in editor-layout's panel switch.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, Palette, Plus, Trash2, GripVertical, ExternalLink,
  Check, AlertCircle, Sparkles, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@/types/database";

interface DesignSystemMeta {
  name?: string;
  icon?: string;
  description?: string;
}

interface AvailableSystem {
  id: string;
  name: string;
  description: string | null;
  design_system_meta: DesignSystemMeta | null;
}

interface ConnectedSystem {
  id: string;
  priority: number;
  enabled: boolean;
  connected_at: string;
  source_project_id: string;
  source: {
    id: string;
    name: string;
    description: string | null;
    design_system_meta: DesignSystemMeta | null;
  } | null;
}

interface DesignSystemsPanelProps {
  project: Project;
  onProjectUpdate?: (patch: Partial<Project>) => void;
}

export function DesignSystemsPanel({ project, onProjectUpdate }: DesignSystemsPanelProps) {
  const [available, setAvailable] = useState<AvailableSystem[]>([]);
  const [connected, setConnected] = useState<ConnectedSystem[]>([]);
  const [isDS, setIsDS] = useState<boolean>(((project as any).is_design_system as boolean | undefined) ?? false);
  const [dsName, setDsName] = useState(((project as any).design_system_meta as DesignSystemMeta | null)?.name ?? project.name);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [availRes, connRes] = await Promise.all([
        fetch("/api/design-systems?available=1"),
        fetch(`/api/design-systems?projectId=${project.id}`),
      ]);
      if (availRes.ok) {
        const a = await availRes.json() as { systems: AvailableSystem[] };
        // Exclude THIS project from the "available" list since you can't connect a project to itself.
        setAvailable((a.systems ?? []).filter((s) => s.id !== project.id));
      }
      if (connRes.ok) {
        const c = await connRes.json() as { systems?: ConnectedSystem[] };
        setConnected(c.systems ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { void load(); }, [load]);

  async function toggleSelfAsDS(next: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/design-systems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          mark: next,
          meta: next ? { name: dsName || project.name } : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setIsDS(next);
      onProjectUpdate?.({ ...(project as any), is_design_system: next });
      toast({
        title: next ? "This project is now a Design System" : "Design System status removed",
        description: next
          ? "Other projects can connect to it. The .lovable/ folder has been seeded if missing."
          : "Any consumers were disconnected automatically.",
      });
      await load();
    } catch (err) {
      toast({ title: "Couldn't update", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function connectSource(sourceId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/design-systems", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerProjectId: project.id,
          sourceProjectId: sourceId,
          action: "connect",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      toast({ title: "Design system connected" });
      await load();
    } catch (err) {
      toast({ title: "Couldn't connect", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function disconnectSource(sourceId: string) {
    if (!confirm("Disconnect this design system from the current project?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/design-systems", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerProjectId: project.id,
          sourceProjectId: sourceId,
          action: "disconnect",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Design system disconnected" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Priority reorder — local order, then PATCH the new array as priority hints.
  async function moveConnected(idx: number, dir: -1 | 1) {
    const next = [...connected];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setConnected(next);
    try {
      await fetch("/api/design-systems", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerProjectId: project.id,
          order: next.map((c) => c.source_project_id),
        }),
      });
    } catch {
      // The optimistic UI is fine on failure — next load() will resync.
    }
  }

  // Filter out already-connected systems from the "Available to connect" list.
  const connectedIds = new Set(connected.map((c) => c.source_project_id));
  const connectables = available.filter((a) => !connectedIds.has(a.id));

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Palette className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold">Design Systems</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* ── Section 1: this project as a DS ─────────────────────────── */}
          <div className="rounded-xl border border-border/60 p-3 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center text-violet-400 flex-shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">Use this project as a Design System</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Marks the project so other projects in this workspace can connect to it. A{" "}
                  <code className="text-[10px]">.lovable/</code> folder with{" "}
                  <code className="text-[10px]">system.md</code> and{" "}
                  <code className="text-[10px]">rules/*.md</code> is seeded automatically — the AI reads these on every prompt in consumer projects.
                </p>
              </div>
              <Switch checked={isDS} onCheckedChange={(v) => void toggleSelfAsDS(v)} disabled={busy} />
            </div>
            {isDS && (
              <div className="pt-2 border-t border-border/40">
                <label className="text-[10px] font-medium text-muted-foreground block mb-1">Display name</label>
                <div className="flex items-center gap-2">
                  <input
                    value={dsName}
                    onChange={(e) => setDsName(e.target.value)}
                    onBlur={() => {
                      if (!dsName.trim()) return;
                      void fetch("/api/design-systems", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          projectId: project.id,
                          mark: true,
                          meta: { name: dsName.trim() },
                        }),
                      });
                    }}
                    className="flex-1 h-7 px-2 rounded border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    placeholder={project.name}
                  />
                  <a
                    href="https://docs.lifemarkai.com/design-systems"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    Docs <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 2: connected design systems ─────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold">Connected design systems</p>
              <span className="ml-auto text-[10px] text-muted-foreground">{connected.length} connected</span>
            </div>
            {connected.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-3 rounded-xl border border-dashed border-border/60">
                No design systems connected to this project yet.
              </p>
            ) : (
              <div className="rounded-xl border border-border/60 divide-y divide-border/40">
                {connected.map((c, idx) => {
                  const meta = c.source?.design_system_meta ?? {};
                  const name = meta.name ?? c.source?.name ?? "Untitled";
                  return (
                    <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => void moveConnected(idx, -1)}
                          disabled={idx === 0 || busy}
                          className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
                          title="Move up — higher priority"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => void moveConnected(idx, 1)}
                          disabled={idx === connected.length - 1 || busy}
                          className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30"
                          title="Move down — lower priority"
                        >
                          ▼
                        </button>
                      </div>
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-sm flex-shrink-0">
                        {meta.icon ?? "🎨"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{name}</p>
                        {c.source?.description && (
                          <p className="text-[10px] text-muted-foreground line-clamp-1">{c.source.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => void disconnectSource(c.source_project_id)}
                        disabled={busy}
                        className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-red-400"
                        title="Disconnect"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Section 3: available DS to connect ──────────────────────── */}
          <div>
            <p className="text-xs font-semibold mb-2">Available to connect</p>
            {connectables.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-3 rounded-xl border border-dashed border-border/60">
                No other projects in this workspace are marked as Design Systems.
              </p>
            ) : (
              <div className="rounded-xl border border-border/60 divide-y divide-border/40">
                {connectables.map((s) => {
                  const meta = s.design_system_meta ?? {};
                  return (
                    <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-sm flex-shrink-0">
                        {meta.icon ?? "🎨"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{meta.name ?? s.name}</p>
                        {s.description && (
                          <p className="text-[10px] text-muted-foreground line-clamp-1">{s.description}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => void connectSource(s.id)}
                        disabled={busy}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Connect
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2 flex items-start gap-2">
            <AlertCircle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-amber-200/90 leading-snug">
              Higher-priority systems are listed first in the AI&apos;s context when both define the same rules. Reorder with the arrows.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
