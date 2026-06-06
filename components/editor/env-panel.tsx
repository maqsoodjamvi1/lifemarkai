"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Eye, EyeOff, Copy, Save, AlertCircle,
  Check, RefreshCw, ChevronDown, Shield, Globe, Server,
  Laptop2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnvPanelProps {
  projectId: string;
  files: Array<{ path: string; content: string }>;
  onUpdateFile: (path: string, content: string) => void;
}

interface EnvVar {
  key: string;
  value: string;
  visible: boolean;
}

// ─── Environment definitions ──────────────────────────────────────────────────

type EnvId = "development" | "staging" | "production";

const ENVIRONMENTS: {
  id: EnvId;
  label: string;
  file: string;
  icon: React.ReactNode;
  color: string;
  accent: string;
  border: string;
  badge: string;
}[] = [
  {
    id: "development",
    label: "Development",
    file: ".env.local",
    icon: <Laptop2 className="w-3 h-3" />,
    color: "text-emerald-400",
    accent: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/20 text-emerald-400",
  },
  {
    id: "staging",
    label: "Staging",
    file: ".env.staging",
    icon: <Server className="w-3 h-3" />,
    color: "text-amber-400",
    accent: "bg-amber-500/10",
    border: "border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-400",
  },
  {
    id: "production",
    label: "Production",
    file: ".env.production",
    icon: <Globe className="w-3 h-3" />,
    color: "text-rose-400",
    accent: "bg-rose-500/10",
    border: "border-rose-500/30",
    badge: "bg-rose-500/20 text-rose-400",
  },
];

const DEFAULT_VARS: EnvVar[] = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", value: "", visible: false },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: "", visible: false },
  { key: "OPENAI_API_KEY", value: "", visible: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseEnvFile(content: string): EnvVar[] {
  const vars: EnvVar[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    vars.push({
      key: trimmed.slice(0, eqIdx).trim(),
      value: trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, ""),
      visible: false,
    });
  }
  return vars;
}

function serializeEnvVars(vars: EnvVar[]): string {
  const lines: string[] = [];
  for (const v of vars) {
    if (!v.key.trim()) continue;
    const needsQuotes = v.value.includes(" ") || v.value.includes("#");
    lines.push(`${v.key}=${needsQuotes ? `"${v.value}"` : v.value}`);
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
}

const isPublicKey = (key: string) => key.startsWith("NEXT_PUBLIC_");

// ─── EnvVar Row ───────────────────────────────────────────────────────────────

function EnvVarRow({
  v, index, onUpdate, onRemove, onToggleVisible,
}: {
  v: EnvVar;
  index: number;
  onUpdate: (i: number, field: "key" | "value", val: string) => void;
  onRemove: (i: number) => void;
  onToggleVisible: (i: number) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      className="flex gap-1.5 items-center group"
    >
      <div className="flex-1 flex gap-1.5">
        {/* Key */}
        <div className="relative flex-1">
          <Input
            value={v.key}
            onChange={(e) => onUpdate(index, "key", e.target.value.toUpperCase().replace(/\s+/g, "_"))}
            className="h-7 text-xs font-mono bg-white/[0.03] border-white/[0.06] pr-8"
            placeholder="KEY_NAME"
          />
          {isPublicKey(v.key) && (
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-emerald-400 font-bold tracking-tight">PUB</span>
          )}
        </div>
        {/* Value */}
        <div className="relative flex-1">
          <Input
            type={v.visible ? "text" : "password"}
            value={v.value}
            onChange={(e) => onUpdate(index, "value", e.target.value)}
            className="h-7 text-xs font-mono bg-white/[0.03] border-white/[0.06] pr-7"
            placeholder="value"
          />
          <button
            onClick={() => onToggleVisible(index)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {v.visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
        </div>
      </div>
      <button
        onClick={() => onRemove(index)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 text-slate-600 hover:text-red-400"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function EnvPanel({ projectId: _projectId, files, onUpdateFile }: EnvPanelProps) {
  const [activeEnv, setActiveEnv] = useState<EnvId>("development");
  // Per-environment var state
  const [envState, setEnvState] = useState<Record<EnvId, EnvVar[]>>({
    development: [],
    staging: [],
    production: [],
  });
  const [dirty, setDirty] = useState<Record<EnvId, boolean>>({
    development: false,
    staging: false,
    production: false,
  });
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showSync, setShowSync] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load all env files from project files when files prop changes
  useEffect(() => {
    const next: Record<EnvId, EnvVar[]> = {
      development: [],
      staging: [],
      production: [],
    };
    for (const env of ENVIRONMENTS) {
      const file = files.find((f) => f.path === env.file);
      if (file?.content?.trim()) {
        next[env.id] = parseEnvFile(file.content);
      } else if (env.id === "development") {
        next[env.id] = DEFAULT_VARS.map((v) => ({ ...v }));
      }
    }
    setEnvState(next);
    setDirty({ development: false, staging: false, production: false });
  }, [files]);

  const vars = envState[activeEnv];
  const env = ENVIRONMENTS.find((e) => e.id === activeEnv)!;

  const updateVars = useCallback((next: EnvVar[]) => {
    setEnvState((prev) => ({ ...prev, [activeEnv]: next }));
    setDirty((prev) => ({ ...prev, [activeEnv]: true }));
  }, [activeEnv]);

  function addVar() {
    if (!newKey.trim()) return;
    const key = newKey.trim().toUpperCase().replace(/\s+/g, "_");
    if (vars.find((v) => v.key === key)) {
      toast({ title: "Key already exists", variant: "destructive" });
      return;
    }
    updateVars([...vars, { key, value: newValue.trim(), visible: false }]);
    setNewKey("");
    setNewValue("");
  }

  function removeVar(i: number) {
    updateVars(vars.filter((_, idx) => idx !== i));
  }

  function updateVar(i: number, field: "key" | "value", val: string) {
    updateVars(vars.map((v, idx) => idx === i ? { ...v, [field]: val } : v));
  }

  function toggleVisible(i: number) {
    setEnvState((prev) => ({
      ...prev,
      [activeEnv]: prev[activeEnv].map((v, idx) => idx === i ? { ...v, visible: !v.visible } : v),
    }));
  }

  function save() {
    const content = serializeEnvVars(vars);
    onUpdateFile(env.file, content);
    setDirty((prev) => ({ ...prev, [activeEnv]: false }));
    toast({ title: `${env.label} vars saved` });
  }

  function copyAll() {
    navigator.clipboard.writeText(serializeEnvVars(vars));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  }

  function syncToAll() {
    const others = ENVIRONMENTS.filter((e) => e.id !== activeEnv);
    for (const other of others) {
      const merged = vars.map((v) => ({ ...v, visible: false }));
      setEnvState((prev) => ({ ...prev, [other.id]: merged }));
      setDirty((prev) => ({ ...prev, [other.id]: true }));
    }
    setShowSync(false);
    toast({ title: `Synced ${env.label} vars to ${others.map((o) => o.label).join(" & ")}` });
  }

  const publicVars = vars.filter((v) => isPublicKey(v.key));
  const secretVars = vars.filter((v) => !isPublicKey(v.key));

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] text-slate-200">
      <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-sm font-semibold">Env Variables</span>
          {dirty[activeEnv] && (
            <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-medium">unsaved</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={copyAll} className="p-1.5 rounded hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition-colors" title="Copy all">
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
          <div className="relative">
            <button onClick={() => setShowSync(!showSync)} className="p-1.5 rounded hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition-colors" title="Sync to all envs">
              <RefreshCw className="w-3 h-3" />
            </button>
            <AnimatePresence>
              {showSync && (
                <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-full mt-1 z-50 bg-[#12141c] border border-white/[0.08] rounded-xl shadow-2xl p-3 w-56">
                  <p className="text-xs font-medium text-slate-300 mb-2">Copy {env.label} \u2192 all envs?</p>
                  <p className="text-[10px] text-slate-500 mb-3">Overwrites other environments with current {env.label.toLowerCase()} vars.</p>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] flex-1" onClick={() => setShowSync(false)}>Cancel</Button>
                    <Button size="sm" className="h-6 text-[10px] flex-1 bg-violet-600 hover:bg-violet-500 text-white" onClick={syncToAll}>Sync</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Button size="sm" onClick={save} disabled={!dirty[activeEnv]}
            className={`h-7 text-[11px] gap-1 ${dirty[activeEnv] ? "bg-violet-600 hover:bg-violet-500 text-white" : ""}`}>
            <Save className="h-3 w-3" />Save
          </Button>
        </div>
      </div>

      <div className="flex border-b border-white/[0.06]">
        {ENVIRONMENTS.map((e) => (
          <button key={e.id} onClick={() => setActiveEnv(e.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors relative ${activeEnv === e.id ? e.color : "text-slate-600 hover:text-slate-400"}`}>
            {e.icon}
            <span className="hidden sm:inline">{e.label}</span>
            <span className="sm:hidden">{e.label.slice(0, 3)}</span>
            {dirty[e.id] && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 absolute top-1.5 right-1.5" />}
            {activeEnv === e.id && <motion.div layoutId="env-tab-bar" className={`absolute bottom-0 left-0 right-0 h-0.5 ${e.accent}`} />}
          </button>
        ))}
      </div>

      <div className={`mx-3 mt-2.5 mb-1 px-2 py-1.5 rounded-lg ${env.accent} border ${env.border} flex items-center gap-2`}>
        <span className={`text-[10px] font-semibold ${env.color} uppercase tracking-wider`}>{env.label}</span>
        <span className="text-[10px] text-slate-500 font-mono">{env.file}</span>
        <span className="ml-auto text-[10px] text-slate-600">{vars.length} var{vars.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        <AnimatePresence mode="popLayout">
          {publicVars.length > 0 && (
            <div key="public-section">
              <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold pt-1 pb-1">Public (browser-safe)</p>
              {vars.map((v, i) => isPublicKey(v.key) ? (
                <EnvVarRow key={`${v.key}-${i}`} v={v} index={i} onUpdate={updateVar} onRemove={removeVar} onToggleVisible={toggleVisible} />
              ) : null)}
            </div>
          )}
          {secretVars.length > 0 && (
            <div key="secret-section">
              <p className="text-[9px] text-slate-600 uppercase tracking-wider font-semibold pt-2 pb-1">Secrets (server-only)</p>
              {vars.map((v, i) => !isPublicKey(v.key) ? (
                <EnvVarRow key={`${v.key}-${i}`} v={v} index={i} onUpdate={updateVar} onRemove={removeVar} onToggleVisible={toggleVisible} />
              ) : null)}
            </div>
          )}
          {vars.length === 0 && (
            <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-xs text-slate-600 text-center py-6">
              No variables for {env.label.toLowerCase()} yet.
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex gap-1.5 items-center pt-2 border-t border-white/[0.06]">
          <Input value={newKey} onChange={(e) => setNewKey(e.target.value)}
            className="h-7 text-xs font-mono flex-1 bg-white/[0.03] border-white/[0.06]"
            placeholder="NEW_KEY" onKeyDown={(e) => e.key === "Enter" && addVar()} />
          <Input value={newValue} onChange={(e) => setNewValue(e.target.value)}
            className="h-7 text-xs font-mono flex-1 bg-white/[0.03] border-white/[0.06]"
            placeholder="value" onKeyDown={(e) => e.key === "Enter" && addVar()} />
          <button onClick={addVar} disabled={!newKey.trim()}
            className="h-7 w-7 flex items-center justify-center rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-30 text-white transition-colors flex-shrink-0">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-start gap-1.5 mt-2 p-2.5 bg-yellow-500/[0.08] border border-yellow-500/20 rounded-lg">
          <AlertCircle className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />
          <p className="text-[10px] text-slate-500 leading-relaxed">
            <span className="text-yellow-400 font-mono">NEXT_PUBLIC_</span> vars are exposed to the browser. All others stay server-side only.
          </p>
        </div>
      </div>
    </div>
  );
}
