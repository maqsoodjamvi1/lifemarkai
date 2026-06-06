"use client";

import { useState, useEffect } from "react";
import { Flag, Plus, Trash2, Copy, Check, Loader2, Code2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

interface FeatureFlagsPanelProps {
  projectId: string;
  onInsertCode: (prompt: string) => void;
}

interface FeatureFlag {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  rollout_pct: number;   // 0–100 percentage rollout
  updated_at: string;
}

const HOOK_CODE = `// hooks/use-feature-flag.ts
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useFeatureFlag(key: string): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase.from("feature_flags")
      .select("enabled, rollout_pct")
      .eq("project_id", process.env.NEXT_PUBLIC_PROJECT_ID ?? "")
      .eq("key", key)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        // Simple rollout: use a stable random per-session number
        const roll = Math.random() * 100;
        setEnabled(data.enabled && roll <= (data.rollout_pct ?? 100));
      });
  }, [key]);
  return enabled;
}

// Usage: const isEnabled = useFeatureFlag("my-feature");`;

const COMPONENT_CODE = `// components/feature-flag.tsx
import { useFeatureFlag } from "@/hooks/use-feature-flag";

export function FeatureFlag({
  flag,
  children,
  fallback = null,
}: {
  flag: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const enabled = useFeatureFlag(flag);
  return <>{enabled ? children : fallback}</>;
}

// Usage:
// <FeatureFlag flag="new-dashboard" fallback={<OldDashboard />}>
//   <NewDashboard />
// </FeatureFlag>`;

export function FeatureFlagsPanel({ projectId, onInsertCode }: FeatureFlagsPanelProps) {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"flags" | "code">("flags");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/feature-flags`)
      .then((r) => r.ok ? r.json() : { flags: [] })
      .then((d) => setFlags(d.flags ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  async function addFlag() {
    if (!newKey.trim()) return;
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    setAdding(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/feature-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, description: newDesc, enabled: false, rollout_pct: 100 }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { flag: FeatureFlag };
      setFlags((f) => [...f, data.flag]);
      setNewKey("");
      setNewDesc("");
      setShowAddForm(false);
      toast({ title: "Flag created", description: `Feature flag "${key}" added.` });
    } catch {
      toast({ title: "Failed to create flag", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function toggleFlag(flag: FeatureFlag) {
    setSaving(flag.id);
    const updated = { ...flag, enabled: !flag.enabled };
    try {
      await fetch(`/api/projects/${projectId}/feature-flags/${flag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: updated.enabled }),
      });
      setFlags((f) => f.map((fl) => fl.id === flag.id ? updated : fl));
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function updateRollout(flag: FeatureFlag, pct: number) {
    setSaving(flag.id);
    try {
      await fetch(`/api/projects/${projectId}/feature-flags/${flag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rollout_pct: pct }),
      });
      setFlags((f) => f.map((fl) => fl.id === flag.id ? { ...fl, rollout_pct: pct } : fl));
    } finally {
      setSaving(null);
    }
  }

  async function deleteFlag(id: string) {
    await fetch(`/api/projects/${projectId}/feature-flags/${id}`, { method: "DELETE" });
    setFlags((f) => f.filter((fl) => fl.id !== id));
  }

  function copyCode(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function insertHook() {
    onInsertCode(`Add these files to my project:\n\n1. \`hooks/use-feature-flag.ts\`:\n\`\`\`ts\n${HOOK_CODE}\n\`\`\`\n\n2. \`components/feature-flag.tsx\`:\n\`\`\`tsx\n${COMPONENT_CODE}\n\`\`\``);
  }

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Flag className="w-4 h-4 text-emerald-400" />
          <h2 className="font-semibold text-foreground">Feature Flags</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
            {flags.length} flags
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Toggle features without redeploying</p>
      </div>

      <div className="flex gap-1 p-2 border-b border-border">
        {(["flags", "code"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
              activeTab === tab ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "code" ? "Hook + Component" : "Flags"}
          </button>
        ))}
      </div>

      {activeTab === "flags" ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setShowAddForm((v) => !v)}>
            <Plus className="w-3.5 h-3.5" /> New flag
          </Button>

          {showAddForm && (
            <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
              <Input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="flag-key (e.g. new-dashboard)"
                className="h-8 text-xs font-mono bg-muted/30 border-border"
              />
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                className="h-8 text-xs bg-muted/30 border-border"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => setShowAddForm(false)}>Cancel</Button>
                <Button size="sm" className="flex-1 gap-1" onClick={addFlag} disabled={adding || !newKey.trim()}>
                  {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Create
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : flags.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Flag className="w-7 h-7 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">No feature flags yet</p>
              <p className="text-xs text-muted-foreground">Create a flag to toggle features without redeploying.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {flags.map((flag) => (
                <div key={flag.id} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono font-semibold text-foreground truncate">{flag.key}</code>
                        <Badge variant="outline" className={`text-[9px] h-4 px-1 shrink-0 ${flag.enabled ? "border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground"}`}>
                          {flag.enabled ? "ON" : "OFF"}
                        </Badge>
                      </div>
                      {flag.description && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{flag.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {saving === flag.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                      <Switch
                        checked={flag.enabled}
                        onCheckedChange={() => toggleFlag(flag)}
                        disabled={saving === flag.id}
                      />
                      <button onClick={() => deleteFlag(flag.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Rollout slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Rollout</span>
                      <span className="text-[10px] font-mono text-foreground">{flag.rollout_pct}%</span>
                    </div>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={flag.rollout_pct}
                      onChange={(e) => updateRollout(flag, Number(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Code tab */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-xs text-muted-foreground">Add these files to your project to use feature flags in your React components.</p>

          {[
            { key: "hook", title: "hooks/use-feature-flag.ts", code: HOOK_CODE },
            { key: "comp", title: "components/feature-flag.tsx", code: COMPONENT_CODE },
          ].map(({ key, title, code }) => (
            <div key={key} className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
                <span className="text-[11px] font-mono text-foreground">{title}</span>
                <button onClick={() => copyCode(key, code)}>
                  {copied === key ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />}
                </button>
              </div>
              <pre className="p-3 text-[10px] font-mono text-foreground overflow-x-auto bg-[#0d1117] max-h-40 whitespace-pre-wrap">
                {code}
              </pre>
            </div>
          ))}

          <Button size="sm" className="w-full gap-1.5" onClick={insertHook}>
            <Code2 className="w-3.5 h-3.5" /> Add both files to project
          </Button>
        </div>
      )}
    </div>
  );
}
