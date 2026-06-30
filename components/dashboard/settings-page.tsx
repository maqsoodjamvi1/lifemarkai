// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Bell, Shield, Key, Palette, Loader2, Save,
  Eye, EyeOff, Trash2, LogOut, Plus, Copy, Check,
  Terminal, ChevronDown, ChevronUp, AlertTriangle,
  Globe, Lock, ExternalLink, Plug,
} from "lucide-react";
import { TelegramSettingsPanel } from "@/components/dashboard/telegram-settings-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import type { Profile } from "@/types/database";
import type { User as SupabaseUser } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

const ALL_SCOPES = [
  { id: "ai:chat",        label: "AI Chat",         desc: "Send chat messages to AI" },
  { id: "ai:plan",        label: "AI Plan",          desc: "Generate architecture plans" },
  { id: "ai:build",       label: "AI Build",         desc: "Generate full file sets" },
  { id: "projects:read",  label: "Projects (read)",  desc: "List and read projects" },
  { id: "projects:write", label: "Projects (write)", desc: "Create and update projects" },
  { id: "deploy",         label: "Deploy",           desc: "Trigger deployments" },
];

// ── Notifications Panel ───────────────────────────────────────────────────────

interface NotifPrefs {
  build_complete_email: boolean;
  deploy_success_email: boolean;
  collaborator_joined_email: boolean;
  weekly_digest_email: boolean;
  marketing_email: boolean;
  credit_low_email: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  build_complete_email: true,
  deploy_success_email: true,
  collaborator_joined_email: true,
  weekly_digest_email: false,
  marketing_email: false,
  credit_low_email: true,
};

const NOTIF_ROWS: { key: keyof NotifPrefs; label: string; description: string }[] = [
  { key: "build_complete_email",      label: "Build complete",         description: "Email when a long AI build finishes" },
  { key: "deploy_success_email",      label: "Deploy success",         description: "Email when your project deploys successfully" },
  { key: "collaborator_joined_email", label: "Collaborator joined",    description: "Email when someone accepts a project invite" },
  { key: "credit_low_email",          label: "Low credit warning",     description: "Email when your credit balance drops below 20" },
  { key: "weekly_digest_email",       label: "Weekly digest",          description: "Summary of your project activity every Monday" },
  { key: "marketing_email",           label: "Product updates",        description: "New features, tips, and announcements from LifemarkAI" },
];

function NotificationsPanel({ userId }: { userId: string }) {
  const [prefs, setPrefs]     = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("notification_prefs")
        .eq("id", userId)
        .single();
      if (data?.notification_prefs) {
        setPrefs({ ...DEFAULT_PREFS, ...(data.notification_prefs as Partial<NotifPrefs>) });
      }
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function toggle(key: keyof NotifPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ notification_prefs: next })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      setPrefs(prefs); // revert
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading preferences…
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Notifications</h2>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-sm text-muted-foreground">
        Choose which emails you receive from LifemarkAI.
      </p>
      <div className="divide-y divide-border">
        {NOTIF_ROWS.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between py-3.5">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <button
              role="switch"
              aria-checked={prefs[key]}
              onClick={() => void toggle(key)}
              className={`relative shrink-0 ml-4 inline-flex h-6 w-11 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
                prefs[key] ? "bg-violet-600" : "bg-input"
              }`}
            >
              <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${prefs[key] ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── API Keys Panel ────────────────────────────────────────────────────────────

function ApiKeysPanel({ userId }: { userId: string }) {
  const [keys, setKeys]             = useState<ApiKey[]>([]);
  const [loading, setLoading]       = useState(true);
  const [creating, setCreating]     = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState("");
  const [newScopes, setNewScopes]   = useState<string[]>(["ai:chat", "projects:read"]);
  const [newExpiry, setNewExpiry]   = useState("");
  const [revealed, setRevealed]     = useState<string | null>(null); // plaintext shown once
  const [copied, setCopied]         = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        const data = await res.json() as { keys: ApiKey[] };
        setKeys(data.keys);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createKey() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), scopes: newScopes, expiresAt: newExpiry || undefined }),
      });
      const data = await res.json() as { key: ApiKey; plaintext: string; error?: string };
      if (!res.ok) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }
      setKeys((prev) => [data.key, ...prev]);
      setRevealed(data.plaintext);
      setShowCreate(false);
      setNewName("");
      setNewExpiry("");
      setNewScopes(["ai:chat", "projects:read"]);
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    const ok = await confirm({
      title: "Revoke API key?",
      description: "Any apps or integrations using this key will immediately lose access.",
      confirmLabel: "Revoke",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
    toast({ title: "Key revoked" });
  }

  async function copyKey(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleScope(scope: string) {
    setNewScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg">Developer API Keys</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create keys to call the LifemarkAI API from your own apps and scripts.
          </p>
        </div>
        <Button size="sm" className="gap-2 shrink-0" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="w-4 h-4" />
          New key
        </Button>
      </div>

      {/* Revealed key banner */}
      <AnimatePresence>
        {revealed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Copy this key now — it will never be shown again
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-black/30 rounded-lg px-3 py-2 break-all text-green-400">
                {revealed}
              </code>
              <button
                onClick={() => copyKey(revealed)}
                className="shrink-0 p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
              </button>
            </div>
            <button
              onClick={() => setRevealed(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              I've saved it — dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-border bg-card p-5 space-y-4"
          >
            <h3 className="font-medium text-sm">New API Key</h3>

            <div className="space-y-2">
              <Label htmlFor="key-name">Key name</Label>
              <Input
                id="key-name"
                placeholder="e.g. My automation script"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={64}
              />
            </div>

            <div className="space-y-2">
              <Label>Expiry (optional)</Label>
              <Input
                type="date"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div className="space-y-2">
              <Label>Scopes</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_SCOPES.map((scope) => (
                  <label
                    key={scope.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all text-xs ${
                      newScopes.includes(scope.id)
                        ? "border-violet-500/50 bg-violet-500/5"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={newScopes.includes(scope.id)}
                      onChange={() => toggleScope(scope.id)}
                      className="accent-violet-500 mt-0.5"
                    />
                    <div>
                      <p className="font-medium">{scope.label}</p>
                      <p className="text-muted-foreground">{scope.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={createKey} disabled={creating || !newName.trim()} className="gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                Generate key
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Key list */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-2xl">
          <Terminal className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No API keys yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create a key to start building integrations</p>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{k.name}</span>
                  {!k.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                      Revoked
                    </span>
                  )}
                  {k.expires_at && new Date(k.expires_at) < new Date() && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">
                      Expired
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <code className="text-xs font-mono text-muted-foreground">{k.key_prefix}••••••••</code>
                  <span className="text-xs text-muted-foreground">
                    {k.last_used_at ? `Last used ${formatDate(k.last_used_at)}` : "Never used"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {k.scopes.join(", ")}
                  </span>
                </div>
              </div>
              <button
                onClick={() => revokeKey(k.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                title="Revoke key"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Usage docs */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usage</p>
        <code className="block text-xs font-mono text-foreground bg-black/20 rounded-lg px-3 py-2">
          curl https://lifemarkai.com/api/ai/chat \<br />
          {"  "}-H &quot;Authorization: Bearer lmk_...&quot; \<br />
          {"  "}-H &quot;Content-Type: application/json&quot; \<br />
          {"  "}-d &apos;&#123;&quot;message&quot;:&quot;Hello&quot;,&quot;projectId&quot;:&quot;...&quot;&#125;&apos;
        </code>
      </div>
    </div>
  );
}

interface SettingsPageProps {
  user: SupabaseUser;
  profile: Profile | null;
}

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "privacy", label: "Privacy", icon: Globe },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "security", label: "Security", icon: Shield },
  { id: "api", label: "API Keys", icon: Key },
  { id: "danger", label: "Danger Zone", icon: Trash2 },
];

export function SettingsPage({ user, profile }: SettingsPageProps) {
  const [active, setActive] = useState("profile");
  const [name, setName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [isPublic, setIsPublic] = useState<boolean>(profile?.is_public ?? false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();
  const confirm = useConfirm();

  const initials = (profile?.full_name ?? user.email ?? "U")
    .split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  async function saveProfile() {
    setSaving(true);
    const { error } = await (supabase as any).from("profiles").update({ full_name: name }).eq("id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated!" });
      router.refresh();
    }
  }

  async function savePrivacy(nextPublic: boolean) {
    setIsPublic(nextPublic);
    setPrivacySaving(true);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ is_public: nextPublic })
      .eq("id", user.id);
    setPrivacySaving(false);
    if (error) {
      setIsPublic(!nextPublic); // revert
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    } else {
      toast({ title: nextPublic ? "Profile is now public" : "Profile is now private" });
      router.refresh();
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function deleteAccount() {
    const ok = await confirm({
      title: "Delete account?",
      description: "This will permanently delete your account, all projects, and all data. This action cannot be undone.",
      confirmLabel: "Delete my account",
      variant: "destructive",
    });
    if (!ok) return;
    toast({ title: "Account deletion requested", description: "Contact support to complete deletion." });
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>

        <div className="flex gap-8">
          {/* Sidebar */}
          <nav className="w-48 shrink-0">
            <ul className="space-y-1">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <button
                    onClick={() => setActive(id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      active === id
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {active === "profile" && (
                <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
                  <h2 className="font-semibold text-lg">Profile</h2>

                  <div className="flex items-center gap-4">
                    <Avatar className="w-16 h-16">
                      <AvatarImage src={profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-gradient-brand text-white text-xl font-bold">{initials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <Button variant="outline" size="sm">Change photo</Button>
                      <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 2MB</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" value={user.email ?? ""} disabled className="text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
                  </div>

                  <Button onClick={saveProfile} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save changes
                  </Button>
                </div>
              )}

              {active === "privacy" && (
                <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
                  <h2 className="font-semibold text-lg">Privacy</h2>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium">Public profile</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Show your projects on your public builder page.</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={isPublic}
                      onClick={() => void savePrivacy(!isPublic)}
                      disabled={privacySaving}
                      className={`relative shrink-0 ml-4 inline-flex h-6 w-11 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                        isPublic ? "bg-violet-600" : "bg-input"
                      }`}
                    >
                      <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${isPublic ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>
                </div>
              )}

              {active === "appearance" && (
                <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
                  <h2 className="font-semibold text-lg">Appearance</h2>
                  <p className="text-sm text-muted-foreground">Theme follows your system preference. Use the theme toggle in the dashboard header to override.</p>
                </div>
              )}

              {active === "notifications" && <NotificationsPanel userId={user.id} />}

              {active === "integrations" && <TelegramSettingsPanel />}

              {active === "security" && (
                <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
                  <h2 className="font-semibold text-lg">Security</h2>
                  <p className="text-sm text-muted-foreground">Manage account access.</p>
                  <Button variant="outline" className="gap-2" onClick={() => void signOut()}>
                    <LogOut className="w-4 h-4" /> Sign out
                  </Button>
                </div>
              )}

              {active === "api" && <ApiKeysPanel userId={user.id} />}

              {active === "danger" && (
                <div className="bg-card border border-destructive/30 rounded-2xl p-6 space-y-5">
                  <h2 className="font-semibold text-lg text-destructive">Danger Zone</h2>
                  <p className="text-sm text-muted-foreground">Permanently delete your account and all projects.</p>
                  <Button variant="destructive" className="gap-2" onClick={() => void deleteAccount()}>
                    <Trash2 className="w-4 h-4" /> Delete account
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
