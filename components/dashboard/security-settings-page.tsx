"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Shield, Monitor, Github, Mail, Download, Trash2,
  CheckCircle2, Loader2, LogOut, Eye, Database,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TwoFactorSection } from "@/components/dashboard/two-factor-section";
import type { User } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  full_name?: string | null;
  email?: string | null;
  github_username?: string | null;
  training_opt_out?: boolean;
  analytics_opt_out?: boolean;
  marketing_emails?: boolean;
}

interface PrivacyPrefs {
  training_opt_out: boolean;
  analytics_opt_out: boolean;
  marketing_emails: boolean;
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ icon, title, description, children }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Separator />
      {children}
    </div>
  );
}

// ─── Toggle row ──────────────────────────────────────────────────────────────

function ToggleRow({
  label, description, checked, onChange, disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SecuritySettingsPage({ user, profile }: { user: User; profile: Profile | null }) {
  const { toast } = useToast();

  // Privacy prefs
  const [prefs, setPrefs] = useState<PrivacyPrefs>({
    training_opt_out: profile?.training_opt_out ?? false,
    analytics_opt_out: profile?.analytics_opt_out ?? false,
    marketing_emails: profile?.marketing_emails ?? true,
  });
  const [prefsSaving, setPrefsSaving] = useState(false);

  // Session info
  const [sessionInfo, setSessionInfo] = useState<{
    last_sign_in: string | null;
  } | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  const confirm = useConfirm();

  useEffect(() => {
    setSessionInfo({ last_sign_in: user.last_sign_in_at ?? null });
  }, [user]);

  const savePrefs = async (patch: Partial<PrivacyPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setPrefsSaving(true);
    try {
      const res = await fetch("/api/account/privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Privacy settings saved" });
    } catch (e) {
      toast({ title: "Failed to save", description: String(e), variant: "destructive" });
      setPrefs(prefs); // rollback
    } finally {
      setPrefsSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lifemarkai-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      const res = await fetch("/api/account/sessions", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "All other sessions revoked" });
    } catch (e) {
      toast({ title: "Failed", description: String(e), variant: "destructive" });
    } finally {
      setRevokingAll(false);
    }
  };

  // Connected providers
  const providers = user.app_metadata?.providers ?? (user.app_metadata?.provider ? [user.app_metadata.provider] : ["email"]);
  const hasGitHub = providers.includes("github");
  const hasGoogle = providers.includes("google");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security & Privacy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account security, active sessions, and data privacy settings.
        </p>
      </div>

      {/* ── Account Security ───────────────────────────────────────────────── */}
      <Section
        icon={<Shield className="w-4 h-4" />}
        title="Account Security"
        description="Login methods and session management"
      >
        {/* Connected providers */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connected accounts</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/40 border border-border">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />Primary
              </Badge>
            </div>

            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${hasGitHub ? "bg-muted/40 border-border" : "bg-muted/20 border-border/50 opacity-60"}`}>
              <Github className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">GitHub</p>
                <p className="text-xs text-muted-foreground">
                  {hasGitHub ? (profile?.github_username ? `@${profile.github_username}` : "Connected") : "Not connected"}
                </p>
              </div>
              {hasGitHub
                ? <Badge variant="secondary" className="text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />Connected</Badge>
                : <Badge variant="outline" className="text-[10px]">Not connected</Badge>
              }
            </div>

            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${hasGoogle ? "bg-muted/40 border-border" : "bg-muted/20 border-border/50 opacity-60"}`}>
              <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Google</p>
                <p className="text-xs text-muted-foreground">{hasGoogle ? "Connected" : "Not connected"}</p>
              </div>
              {hasGoogle
                ? <Badge variant="secondary" className="text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />Connected</Badge>
                : <Badge variant="outline" className="text-[10px]">Not connected</Badge>
              }
            </div>
          </div>
        </div>

        {/* Sessions */}
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active session</p>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/40 border border-border">
            <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5">
                Current device
                <Badge className="text-[10px] h-4 px-1.5 bg-emerald-500/20 text-emerald-600 border-0">Active</Badge>
              </p>
              {sessionInfo?.last_sign_in && (
                <p className="text-xs text-muted-foreground">
                  Last sign-in {new Date(sessionInfo.last_sign_in).toLocaleDateString("en", { dateStyle: "medium" })}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-2 h-8"
            onClick={handleRevokeAll}
            disabled={revokingAll}
          >
            {revokingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            Revoke all other sessions
          </Button>
        </div>

        <TwoFactorSection user={user} />
      </Section>

      {/* ── Privacy Settings ──────────────────────────────────────────────── */}
      <Section
        icon={<Eye className="w-4 h-4" />}
        title="Privacy Settings"
        description="Control how your data is used to improve LifemarkAI"
      >
        <div className="space-y-5">
          <ToggleRow
            label="Opt out of AI training"
            description="Your prompts and AI outputs will not be used to train or improve our models. Projects remain private regardless."
            checked={prefs.training_opt_out}
            onChange={(v) => savePrefs({ training_opt_out: v })}
            disabled={prefsSaving}
          />
          <Separator />
          <ToggleRow
            label="Opt out of analytics"
            description="Disable usage analytics collection. Note: we may still collect data required for billing and legal compliance."
            checked={prefs.analytics_opt_out}
            onChange={(v) => savePrefs({ analytics_opt_out: v })}
            disabled={prefsSaving}
          />
          <Separator />
          <ToggleRow
            label="Marketing emails"
            description="Receive product updates, tips, and feature announcements from LifemarkAI."
            checked={prefs.marketing_emails}
            onChange={(v) => savePrefs({ marketing_emails: v })}
            disabled={prefsSaving}
          />
        </div>
      </Section>

      {/* ── Data & Account ────────────────────────────────────────────────── */}
      <Section
        icon={<Database className="w-4 h-4" />}
        title="Data & Account"
        description="Export your data or permanently delete your account"
      >
        <div className="space-y-4">
          {/* Export */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Export your data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Download a JSON file containing all your projects, messages, and account information.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-2 h-8 shrink-0"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export
            </Button>
          </div>

          <Separator />

          {/* Delete account */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-destructive">Delete account</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs gap-2 h-8 shrink-0"
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete your account?",
                  description: "This will permanently delete your account, all projects, files, and messages. This cannot be undone. To proceed, contact support@lifemarkai.com.",
                  confirmLabel: "I understand — contact support",
                  variant: "destructive",
                });
                if (ok) {
                  window.location.href = "mailto:support@lifemarkai.com?subject=Account%20Deletion%20Request&body=Please%20delete%20my%20account%3A%20" + encodeURIComponent(user.email ?? "");
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />Delete
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
