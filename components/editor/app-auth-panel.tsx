"use client";

/**
 * App-side auth-provider wizard.
 *
 * Configures sign-in providers for END USERS of the deployed app, not for
 * LifemarkAI users themselves. Backed by app_auth_providers (migration 052)
 * and /api/projects/[id]/app-auth (GET/POST/PATCH/DELETE).
 *
 * Three providers supported by the API today:
 *   • google — managed (Lifemark-managed OAuth) or byok (own client_id/secret)
 *   • saml   — IdP entity_id, sso_url, x509 cert; ACS URL is returned by API
 *   • oidc   — issuer, client_id, client_secret; callback URL returned by API
 *
 * UX choices:
 *   • Each provider gets a card with an Enable/Disable toggle.
 *   • Google offers a mode switch (managed vs BYOK). Enabling managed is one
 *     click; BYOK opens a small config form.
 *   • SAML and OIDC always require BYOK config; the form shows the
 *     auto-generated callback / ACS URL after save so the user can paste it
 *     into their IdP.
 *   • Secrets are write-only — the GET endpoint masks them as "•••••••• (set)".
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Check, AlertCircle, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@/types/database";

type Provider = "google" | "saml" | "oidc";
type Mode = "managed" | "byok";

interface ProviderRow {
  id: string;
  provider: Provider;
  mode: Mode;
  enabled: boolean;
  config: Record<string, string | null>;
}

interface AppAuthPanelProps {
  project: Project;
}

const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

const PROVIDER_META: Record<Provider, { label: string; description: string; docs: string }> = {
  google: {
    label: "Google",
    description: "Let end-users sign in with Google. Managed mode uses Lifemark's OAuth client; BYOK uses your own GCP credentials.",
    docs: "https://console.cloud.google.com/apis/credentials",
  },
  saml: {
    label: "SAML 2.0",
    description: "Enterprise single sign-on. Works with Okta, Entra ID, OneLogin, JumpCloud, or any SAML 2.0 IdP.",
    docs: "https://docs.lifemarkai.com/auth/saml",
  },
  oidc: {
    label: "OIDC",
    description: "Generic OpenID Connect. Use this for IdPs that aren't SAML and aren't Google.",
    docs: "https://docs.lifemarkai.com/auth/oidc",
  },
};

function copy(text: string, onSuccess?: () => void) {
  void navigator.clipboard.writeText(text).then(() => onSuccess?.());
}

export function AppAuthPanel({ project }: AppAuthPanelProps) {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);
  // Tracks which provider has its BYOK form expanded for editing.
  const [editing, setEditing] = useState<Provider | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/app-auth`);
      if (res.ok) {
        const data = await res.json() as { providers: ProviderRow[] };
        setRows(data.providers ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { void load(); }, [load]);

  function rowFor(provider: Provider): ProviderRow | undefined {
    return rows.find((r) => r.provider === provider);
  }

  async function enable(provider: Provider, mode: Mode, config: Record<string, string>) {
    setBusyProvider(provider);
    try {
      const res = await fetch(`/api/projects/${project.id}/app-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, mode, config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast({ title: `${PROVIDER_META[provider].label} enabled` });
      setEditing(null);
      setDraft({});
      await load();
    } catch (err) {
      toast({
        title: "Couldn't enable",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusyProvider(null);
    }
  }

  async function toggle(provider: Provider, enabled: boolean) {
    setBusyProvider(provider);
    try {
      const res = await fetch(`/api/projects/${project.id}/app-auth`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, enabled }),
      });
      if (!res.ok) throw new Error("Failed");
      await load();
    } catch (err) {
      toast({ title: "Couldn't update", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setBusyProvider(null);
    }
  }

  async function disable(provider: Provider) {
    if (!confirm(`Disable ${PROVIDER_META[provider].label} sign-in for end users?`)) return;
    setBusyProvider(provider);
    try {
      const res = await fetch(`/api/projects/${project.id}/app-auth?provider=${provider}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: `${PROVIDER_META[provider].label} disabled` });
      await load();
    } finally {
      setBusyProvider(null);
    }
  }

  function CopyBtn({ text, k }: { text: string; k: string }) {
    return (
      <button
        type="button"
        onClick={() => copy(text, () => {
          setCopiedKey(k);
          setTimeout(() => setCopiedKey((curr) => curr === k ? null : curr), 1500);
        })}
        className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground"
        title="Copy"
      >
        {copiedKey === k ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold">App sign-in providers</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-[11px] text-muted-foreground">
          Configure how END USERS of {project.name} sign in. These are separate from your own LifemarkAI workspace auth.
        </p>

        {/* ── Google ───────────────────────────────────────────────────── */}
        {(() => {
          const row = rowFor("google");
          const isEditing = editing === "google";
          const acsLike = `${APP_URL}/api/auth/google/${project.id}/callback`;
          return (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="flex items-start gap-3 p-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-base flex-shrink-0">🔵</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold">{PROVIDER_META.google.label}</p>
                    {row?.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {row.mode === "managed" ? "Managed" : "BYOK"} · live
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{PROVIDER_META.google.description}</p>
                </div>
                {row ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      onClick={() => void toggle("google", !row.enabled)}
                      disabled={busyProvider === "google"}
                    >
                      {row.enabled ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px] text-red-400 hover:text-red-300"
                      onClick={() => void disable("google")}
                      disabled={busyProvider === "google"}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      className="h-7 text-[11px] bg-violet-600 hover:bg-violet-500 text-white"
                      onClick={() => void enable("google", "managed", {})}
                      disabled={busyProvider === "google"}
                    >
                      {busyProvider === "google" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Enable (managed)"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => { setEditing(isEditing ? null : "google"); setDraft({}); }}
                    >
                      BYOK…
                    </Button>
                  </div>
                )}
              </div>
              {isEditing && (
                <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-muted/10 space-y-2">
                  <p className="text-[10px] text-muted-foreground">
                    Use your own GCP OAuth credentials.{" "}
                    <a href={PROVIDER_META.google.docs} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">
                      Get them in Google Cloud Console <ExternalLink className="w-2.5 h-2.5 inline" />
                    </a>
                  </p>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Authorized redirect URI</label>
                    <div className="flex items-center gap-1 mt-1">
                      <code className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 truncate">{acsLike}</code>
                      <CopyBtn text={acsLike} k="g-acs" />
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">Paste this into the &ldquo;Authorized redirect URIs&rdquo; box when you create the OAuth client.</p>
                  </div>
                  <input
                    placeholder="Client ID"
                    value={draft.client_id ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, client_id: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                  <input
                    placeholder="Client Secret"
                    type="password"
                    value={draft.client_secret ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, client_secret: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-7 text-[11px]">Cancel</Button>
                    <Button
                      size="sm"
                      className="h-7 text-[11px] bg-violet-600 hover:bg-violet-500 text-white"
                      disabled={!draft.client_id || !draft.client_secret || busyProvider === "google"}
                      onClick={() => void enable("google", "byok", { client_id: draft.client_id!, client_secret: draft.client_secret! })}
                    >
                      {busyProvider === "google" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save BYOK"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── SAML ─────────────────────────────────────────────────────── */}
        {(() => {
          const row = rowFor("saml");
          const isEditing = editing === "saml";
          const acsUrl = `${APP_URL}/api/auth/saml/${project.id}/callback`;
          const entityId = `${APP_URL}/saml/${project.id}`;
          return (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="flex items-start gap-3 p-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-base flex-shrink-0">🏢</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold">{PROVIDER_META.saml.label}</p>
                    {row?.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        configured
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{PROVIDER_META.saml.description}</p>
                </div>
                {row ? (
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-red-400 hover:text-red-300" onClick={() => void disable("saml")}>
                    Remove
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { setEditing(isEditing ? null : "saml"); setDraft({}); }}>
                    Configure
                  </Button>
                )}
              </div>
              {isEditing && (
                <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-muted/10 space-y-2">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Give these to your IdP</p>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground w-20">ACS URL</span>
                      <code className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 truncate">{acsUrl}</code>
                      <CopyBtn text={acsUrl} k="saml-acs" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground w-20">Entity ID</span>
                      <code className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 truncate">{entityId}</code>
                      <CopyBtn text={entityId} k="saml-eid" />
                    </div>
                  </div>
                  <div className="space-y-1 pt-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Get these from your IdP</p>
                    <input
                      placeholder="IdP Entity ID"
                      value={draft.idp_entity_id ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, idp_entity_id: e.target.value }))}
                      className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                    <input
                      placeholder="IdP SSO URL"
                      value={draft.idp_sso_url ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, idp_sso_url: e.target.value }))}
                      className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                    <textarea
                      placeholder="IdP X.509 certificate (PEM)"
                      rows={4}
                      value={draft.idp_x509_cert ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, idp_x509_cert: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-[10px] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-7 text-[11px]">Cancel</Button>
                    <Button
                      size="sm"
                      className="h-7 text-[11px] bg-violet-600 hover:bg-violet-500 text-white"
                      disabled={!draft.idp_entity_id || !draft.idp_sso_url || !draft.idp_x509_cert || busyProvider === "saml"}
                      onClick={() => void enable("saml", "byok", {
                        idp_entity_id: draft.idp_entity_id!,
                        idp_sso_url: draft.idp_sso_url!,
                        idp_x509_cert: draft.idp_x509_cert!,
                      })}
                    >
                      {busyProvider === "saml" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save SAML"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── OIDC ─────────────────────────────────────────────────────── */}
        {(() => {
          const row = rowFor("oidc");
          const isEditing = editing === "oidc";
          const cb = `${APP_URL}/api/auth/oidc/${project.id}/callback`;
          return (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="flex items-start gap-3 p-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-base flex-shrink-0">🔑</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold">{PROVIDER_META.oidc.label}</p>
                    {row?.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">configured</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{PROVIDER_META.oidc.description}</p>
                </div>
                {row ? (
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-red-400 hover:text-red-300" onClick={() => void disable("oidc")}>
                    Remove
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { setEditing(isEditing ? null : "oidc"); setDraft({}); }}>
                    Configure
                  </Button>
                )}
              </div>
              {isEditing && (
                <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-muted/10 space-y-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground w-20">Callback URL</span>
                    <code className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 truncate">{cb}</code>
                    <CopyBtn text={cb} k="oidc-cb" />
                  </div>
                  <input
                    placeholder="Issuer (e.g. https://accounts.example.com)"
                    value={draft.issuer ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, issuer: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                  <input
                    placeholder="Client ID"
                    value={draft.client_id ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, client_id: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                  <input
                    placeholder="Client Secret"
                    type="password"
                    value={draft.client_secret ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, client_secret: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-7 text-[11px]">Cancel</Button>
                    <Button
                      size="sm"
                      className="h-7 text-[11px] bg-violet-600 hover:bg-violet-500 text-white"
                      disabled={!draft.issuer || !draft.client_id || !draft.client_secret || busyProvider === "oidc"}
                      onClick={() => void enable("oidc", "byok", {
                        issuer: draft.issuer!,
                        client_id: draft.client_id!,
                        client_secret: draft.client_secret!,
                      })}
                    >
                      {busyProvider === "oidc" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save OIDC"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-200/90">
            These providers are for end users of the deployed app — your own LifemarkAI workspace login is unaffected.
          </p>
        </div>
      </div>
    </div>
  );
}
