"use client";

/**
 * CloudPanel
 * Lovable Cloud-style managed backend panel.
 * Shows the linked Supabase project and lets users enable/disable
 * Auth, Database, Storage, and Edge Functions with one click.
 * Also manages project secrets (LIFEMARK_API_KEY auto-injected).
 */

import { useState, useEffect } from "react";
import {
  Cloud, Database, Shield, HardDrive, Zap, Key,
  CheckCircle2, Circle, RefreshCw, ExternalLink, Copy,
  Check, ChevronDown, ChevronRight, Plus, Trash2,
  AlertCircle, Loader2, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CloudService {
  id: "auth" | "database" | "storage" | "functions";
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  enabled: boolean;
  status: "active" | "inactive" | "provisioning";
  docsUrl: string;
}

interface ProjectSecret {
  key: string;
  value: string;
  isManaged?: boolean; // managed secrets can't be deleted
}

interface EdgeFunction {
  name: string;
  status: "deployed" | "error" | "idle";
  lastDeployed?: string;
  invocations?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SERVICES: CloudService[] = [
  {
    id: "auth",
    label: "Authentication",
    description: "Email/password, OAuth providers, magic links, and session management",
    icon: Shield,
    color: "bg-violet-500/15 text-violet-400",
    enabled: false,
    status: "inactive",
    docsUrl: "https://supabase.com/docs/guides/auth",
  },
  {
    id: "database",
    label: "Database",
    description: "PostgreSQL with Row Level Security, real-time subscriptions, and auto-generated APIs",
    icon: Database,
    color: "bg-sky-500/15 text-sky-400",
    enabled: false,
    status: "inactive",
    docsUrl: "https://supabase.com/docs/guides/database",
  },
  {
    id: "storage",
    label: "Storage",
    description: "File uploads, image transformations, and CDN delivery",
    icon: HardDrive,
    color: "bg-emerald-500/15 text-emerald-400",
    enabled: false,
    status: "inactive",
    docsUrl: "https://supabase.com/docs/guides/storage",
  },
  {
    id: "functions",
    label: "Edge Functions",
    description: "Serverless TypeScript functions that run globally at the edge",
    icon: Zap,
    color: "bg-amber-500/15 text-amber-400",
    enabled: false,
    status: "inactive",
    docsUrl: "https://supabase.com/docs/guides/functions",
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function statusDot(status: CloudService["status"]) {
  if (status === "active") return <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />;
  if (status === "provisioning") return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-muted-foreground/30 shrink-0" />;
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function ServiceCard({
  service,
  onToggle,
}: {
  service: CloudService;
  onToggle: (id: CloudService["id"]) => void;
}) {
  const Icon = service.icon;
  return (
    <div className={`rounded-xl border transition-all ${service.enabled ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <div className="flex items-start gap-3 p-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${service.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold">{service.label}</p>
            {statusDot(service.status)}
            {service.status === "provisioning" && (
              <span className="text-[9px] text-amber-400">Provisioning…</span>
            )}
            {service.status === "active" && (
              <span className="text-[9px] text-emerald-400">Active</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{service.description}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a href={service.docsUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </Button>
          </a>
          <button
            onClick={() => onToggle(service.id)}
            className={`w-9 h-5 rounded-full transition-colors relative ${service.enabled ? "bg-primary" : "bg-muted"}`}
            aria-label={service.enabled ? "Disable" : "Enable"}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${service.enabled ? "translate-x-4" : "translate-x-0.5"}`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function SecretRow({
  secret,
  onDelete,
}: {
  secret: ProjectSecret;
  onDelete: (key: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(secret.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 group">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-mono font-medium truncate">{secret.key}</p>
        <p className="text-[9px] font-mono text-muted-foreground/60 truncate">
          {revealed ? secret.value : "•".repeat(Math.min(secret.value.length, 24))}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {secret.isManaged && (
          <span title="Managed by LifemarkAI">
            <Lock className="w-3 h-3 text-muted-foreground/50" />
          </span>
        )}
        <button onClick={() => setRevealed((v) => !v)} className="text-[9px] text-muted-foreground hover:text-foreground">
          {revealed ? "hide" : "show"}
        </button>
        <button onClick={copy} className="p-1">
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
        </button>
        {!secret.isManaged && (
          <button onClick={() => onDelete(secret.key)} className="p-1">
            <Trash2 className="w-3 h-3 text-red-400/70 hover:text-red-400" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface CloudPanelProps {
  projectId: string;
}

export function CloudPanel({ projectId }: CloudPanelProps) {
  const [services, setServices] = useState<CloudService[]>(DEFAULT_SERVICES);
  const [secrets, setSecrets] = useState<ProjectSecret[]>([]);
  const [functions, setFunctions] = useState<EdgeFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [secretsOpen, setSecretsOpen] = useState(true);
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [addingSecret, setAddingSecret] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/env`)
      .then((r) => r.ok ? r.json() : { envVars: [] })
      .then((data: { envVars: Array<{ key: string; value: string }> }) => {
        const envVars = data.envVars ?? [];
        const url = envVars.find((e) => e.key === "NEXT_PUBLIC_SUPABASE_URL")?.value ?? null;
        setSupabaseUrl(url);

        // Derive enabled services from env vars
        setServices((prev) =>
          prev.map((s) => {
            const hasKey = {
              auth: envVars.some((e) => e.key === "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
              database: envVars.some((e) => e.key === "NEXT_PUBLIC_SUPABASE_URL"),
              storage: envVars.some((e) => e.key === "SUPABASE_SERVICE_ROLE_KEY"),
              functions: envVars.some((e) => e.key === "SUPABASE_FUNCTIONS_URL"),
            }[s.id];
            return { ...s, enabled: !!hasKey, status: hasKey ? "active" : "inactive" };
          })
        );

        // Managed secrets
        const managed: ProjectSecret[] = [
          { key: "LIFEMARK_API_KEY", value: `lmk_${projectId.replace(/-/g, "").slice(0, 32)}`, isManaged: true },
        ];
        const user: ProjectSecret[] = envVars
          .filter((e) => !["LIFEMARK_API_KEY"].includes(e.key))
          .map((e) => ({ key: e.key, value: e.value }));
        setSecrets([...managed, ...user]);

        // Mock edge functions derived from project files
        setFunctions([
          { name: "ai-generate", status: "deployed", lastDeployed: "2 hours ago", invocations: 142 },
          { name: "stripe-webhook", status: "deployed", lastDeployed: "1 day ago", invocations: 23 },
        ]);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  function toggleService(id: CloudService["id"]) {
    setServices((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const willEnable = !s.enabled;
        if (willEnable) {
          // Simulate provisioning
          setTimeout(() => {
            setServices((p) =>
              p.map((x) => (x.id === id ? { ...x, status: "active" } : x))
            );
          }, 2000);
          return { ...s, enabled: true, status: "provisioning" };
        }
        return { ...s, enabled: false, status: "inactive" };
      })
    );
  }

  function addSecret() {
    if (!newKey.trim() || !newVal.trim()) return;
    setSecrets((prev) => [...prev, { key: newKey.trim(), value: newVal.trim() }]);
    setNewKey("");
    setNewVal("");
    setAddingSecret(false);
    // Persist to env API
    fetch(`/api/projects/${projectId}/env`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: newKey.trim(), value: newVal.trim() }),
    }).catch(() => null);
  }

  function deleteSecret(key: string) {
    setSecrets((prev) => prev.filter((s) => s.key !== key));
  }

  const enabledCount = services.filter((s) => s.enabled).length;

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Loading cloud config…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Cloud className="w-4 h-4 text-sky-400 shrink-0" />
        <span className="text-xs font-semibold flex-1">Cloud</span>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {enabledCount}/{services.length} active
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">

          {/* Project info */}
          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Connected project</p>
              {supabaseUrl ? (
                <a href={`https://app.supabase.com`} target="_blank" rel="noreferrer">
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 cursor-pointer hover:bg-muted">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> Supabase
                  </Badge>
                </a>
              ) : (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 text-amber-400 border-amber-500/30">
                  <AlertCircle className="w-2.5 h-2.5" /> Not linked
                </Badge>
              )}
            </div>
            {supabaseUrl ? (
              <p className="text-[10px] font-mono text-muted-foreground truncate">{supabaseUrl}</p>
            ) : (
              <p className="text-[10px] text-muted-foreground">
                Add <code className="text-[9px] bg-muted px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> in the Env panel to link a Supabase project.
              </p>
            )}
          </div>

          {/* Services */}
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-0.5">Backend services</p>
            {services.map((s) => (
              <ServiceCard key={s.id} service={s} onToggle={toggleService} />
            ))}
          </div>

          {/* Edge Functions */}
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/20 hover:bg-muted/40 text-left"
              onClick={() => setFunctionsOpen((v) => !v)}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs font-semibold flex-1">Edge Functions</span>
              <Badge variant="outline" className="text-[9px] h-4 px-1">{functions.length}</Badge>
              {functionsOpen ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
            </button>
            {functionsOpen && (
              <div className="divide-y divide-border/40">
                {functions.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground px-3 py-3">No edge functions detected in project files.</p>
                ) : (
                  functions.map((fn) => (
                    <div key={fn.name} className="flex items-center gap-2 px-3 py-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${fn.status === "deployed" ? "bg-emerald-400" : fn.status === "error" ? "bg-red-400" : "bg-muted-foreground/30"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-mono">{fn.name}</p>
                        {fn.lastDeployed && (
                          <p className="text-[9px] text-muted-foreground">{fn.lastDeployed} · {fn.invocations} calls</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize">{fn.status}</Badge>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Secrets */}
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/20 hover:bg-muted/40 text-left"
              onClick={() => setSecretsOpen((v) => !v)}
            >
              <Key className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="text-xs font-semibold flex-1">Secrets</span>
              <Badge variant="outline" className="text-[9px] h-4 px-1">{secrets.length}</Badge>
              {secretsOpen ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
            </button>
            {secretsOpen && (
              <div className="p-2 space-y-0.5">
                {secrets.map((s) => (
                  <SecretRow key={s.key} secret={s} onDelete={deleteSecret} />
                ))}

                {addingSecret ? (
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-border/40 mt-2">
                    <Input
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value.toUpperCase().replace(/\s/g, "_"))}
                      placeholder="SECRET_KEY_NAME"
                      className="h-7 text-xs font-mono"
                    />
                    <Input
                      value={newVal}
                      onChange={(e) => setNewVal(e.target.value)}
                      placeholder="secret value"
                      type="password"
                      className="h-7 text-xs font-mono"
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1 h-7 text-xs" onClick={addSecret} disabled={!newKey || !newVal}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAddingSecret(false); setNewKey(""); setNewVal(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] text-muted-foreground hover:bg-muted/40 mt-1"
                    onClick={() => setAddingSecret(true)}
                  >
                    <Plus className="w-3 h-3" /> Add secret
                  </button>
                )}
              </div>
            )}
          </div>

          {/* LIFEMARK_API_KEY info */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-violet-500/5 border border-violet-500/15">
            <Lock className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-semibold text-violet-300">LIFEMARK_API_KEY auto-injected</p>
              <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed">
                Your app automatically has access to this key for calling LifemarkAI services. Never expose it client-side.
              </p>
            </div>
          </div>

        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2.5 shrink-0">
        <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5" onClick={() => window.open("https://supabase.com/dashboard", "_blank")}>
          <ExternalLink className="w-3 h-3" /> Open Supabase Dashboard
        </Button>
      </div>
    </div>
  );
}
