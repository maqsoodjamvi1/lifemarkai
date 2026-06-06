"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Plus, Trash2, Eye, EyeOff, Copy, Check, Loader2, AlertTriangle, RefreshCw, Clock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface SecretsVaultPanelProps {
  projectId: string;
}

interface Secret {
  id: string;
  key: string;
  description: string | null;
  last_used_at: string | null;
  rotate_after_days: number;
  days_old: number;
  needs_rotation: boolean;
  created_at: string;
}

export function SecretsVaultPanel({ projectId }: SecretsVaultPanelProps) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [revealedValue, setRevealedValue] = useState<string>("");
  const [revealing, setRevealing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRotate, setNewRotate] = useState(90);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"secrets" | "log">("secrets");
  const [accessLog, setAccessLog] = useState<{ action: string; accessed_at: string; key?: string }[]>([]);

  useEffect(() => { loadSecrets(); }, [projectId]);

  async function loadSecrets() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/secrets`);
      const data = await res.json() as { secrets: Secret[] };
      setSecrets(data.secrets ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function revealSecret(id: string) {
    if (revealedId === id) { setRevealedId(null); setRevealedValue(""); return; }
    setRevealing(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/secrets/${id}`);
      const data = await res.json() as { value: string };
      setRevealedId(id);
      setRevealedValue(data.value ?? "");
    } catch { toast({ title: "Could not reveal secret", variant: "destructive" }); }
    finally { setRevealing(null); }
  }

  async function copySecret(id: string) {
    if (revealedId !== id) {
      // Reveal first then copy
      setRevealing(id);
      const res = await fetch(`/api/projects/${projectId}/secrets/${id}`);
      const data = await res.json() as { value: string };
      setRevealing(null);
      navigator.clipboard.writeText(data.value ?? "");
    } else {
      navigator.clipboard.writeText(revealedValue);
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function addSecret() {
    if (!newKey.trim() || !newValue.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newKey, value: newValue, description: newDesc, rotate_after_days: newRotate }),
      });
      if (!res.ok) throw new Error();
      setNewKey(""); setNewValue(""); setNewDesc(""); setNewRotate(90); setShowAdd(false);
      toast({ title: "Secret saved" });
      await loadSecrets();
    } catch { toast({ title: "Failed to save secret", variant: "destructive" }); }
    finally { setAdding(false); }
  }

  async function deleteSecret(id: string) {
    setDeleting(id);
    await fetch(`/api/projects/${projectId}/secrets/${id}`, { method: "DELETE" });
    setSecrets((s) => s.filter((x) => x.id !== id));
    if (revealedId === id) { setRevealedId(null); setRevealedValue(""); }
    setDeleting(null);
  }

  const needsRotation = secrets.filter((s) => s.needs_rotation);

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h2 className="font-semibold text-foreground">Secrets Vault</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
            {secrets.length} secrets
          </Badge>
          {needsRotation.length > 0 && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/40 text-amber-400 ml-auto">
              {needsRotation.length} need rotation
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Encrypted secrets with rotation tracking</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-border">
        {(["secrets", "log"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
              activeTab === tab ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "log" ? "Access Log" : "Secrets"}
          </button>
        ))}
      </div>

      {activeTab === "secrets" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="w-3.5 h-3.5" /> New secret
          </Button>

          {showAdd && (
            <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
              <Input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                placeholder="SECRET_KEY_NAME"
                className="h-8 text-xs font-mono bg-muted/30 border-border"
              />
              <Input
                type="password"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="Secret value"
                className="h-8 text-xs bg-muted/30 border-border"
              />
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                className="h-8 text-xs bg-muted/30 border-border"
              />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground shrink-0">Rotate every</span>
                <Input
                  type="number"
                  value={newRotate}
                  onChange={(e) => setNewRotate(Number(e.target.value))}
                  className="h-7 w-16 text-xs bg-muted/30 border-border"
                  min={1} max={365}
                />
                <span className="text-[10px] text-muted-foreground">days</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="flex-1 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button size="sm" className="flex-1 text-xs gap-1" onClick={addSecret} disabled={adding || !newKey || !newValue}>
                  {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Save
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : secrets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <ShieldCheck className="w-7 h-7 text-muted-foreground/30" />
              <p className="text-sm font-medium text-foreground">No secrets stored</p>
              <p className="text-xs text-muted-foreground">Add encrypted secrets to use them securely in your app.</p>
            </div>
          ) : (
            secrets.map((secret) => (
              <div key={secret.id} className={`rounded-xl border bg-muted/10 p-3 space-y-2 ${secret.needs_rotation ? "border-amber-500/30" : "border-border"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <code className="text-xs font-mono font-semibold text-foreground">{secret.key}</code>
                    {secret.description && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{secret.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {secret.needs_rotation && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-label="Rotation recommended" />
                    )}
                    <button onClick={() => revealSecret(secret.id)} className="text-muted-foreground hover:text-foreground p-0.5" disabled={revealing === secret.id}>
                      {revealing === secret.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : revealedId === secret.id
                          ? <EyeOff className="w-3.5 h-3.5" />
                          : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => copySecret(secret.id)} className="text-muted-foreground hover:text-foreground p-0.5">
                      {copied === secret.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => deleteSecret(secret.id)} className="text-muted-foreground hover:text-red-400 p-0.5">
                      {deleting === secret.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {revealedId === secret.id && (
                  <div className="rounded-md bg-muted/30 px-2.5 py-1.5">
                    <code className="text-[11px] font-mono text-foreground break-all">{revealedValue}</code>
                  </div>
                )}

                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> {secret.days_old}d old
                  </span>
                  <span className="flex items-center gap-1">
                    <RotateCw className="w-2.5 h-2.5" />
                    {secret.needs_rotation
                      ? <span className="text-amber-400">Rotate now</span>
                      : `Rotate in ${secret.rotate_after_days - secret.days_old}d`}
                  </span>
                  {secret.last_used_at && (
                    <span>Last used {new Date(secret.last_used_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "log" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground">Access log is recorded server-side per reveal/write/delete action.</p>
          <div className="rounded-xl border border-border bg-muted/10 p-3">
            <p className="text-xs text-muted-foreground text-center py-4">
              Access logs are stored in Supabase. Query the <code className="font-mono">secret_access_logs</code> table in the DB Query panel for a full audit trail.
            </p>
          </div>
        </div>
      )}

      <div className="p-3 border-t border-border">
        <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={loadSecrets}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>
    </div>
  
  );
}
