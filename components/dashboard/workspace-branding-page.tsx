"use client";

import { useState, useEffect, useRef } from "react";
import { Palette, Upload, Check, Loader2, Globe, Mail, Eye, EyeOff, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { BrandedUrlsSection } from "./branded-urls-section";

interface WorkspaceBrandingPageProps {
  teamId: string;
  plan: string; // "enterprise" required for full white-label
}

interface BrandingConfig {
  logo_url: string;
  primary_color: string;
  company_name: string;
  support_email: string;
  custom_domain: string;
  hide_powered_by: boolean;
}

const PRESET_COLORS = [
  "#8b5cf6", // violet
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#64748b", // slate
];

export function WorkspaceBrandingPage({ teamId, plan }: WorkspaceBrandingPageProps) {
  const isEnterprise = plan === "enterprise";

  const [config, setConfig] = useState<BrandingConfig>({
    logo_url: "",
    primary_color: "#8b5cf6",
    company_name: "",
    support_email: "",
    custom_domain: "",
    hide_powered_by: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/teams/${teamId}/branding`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.branding) setConfig(data.branding); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamId]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/branding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Branding saved", description: "Your workspace branding has been updated." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("teamId", teamId);
      const res = await fetch("/api/teams/upload-logo", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const { url } = await res.json() as { url: string };
      setConfig((c) => ({ ...c, logo_url: url }));
      toast({ title: "Logo uploaded" });
    } catch {
      toast({ title: "Upload failed", description: "Max 2MB, PNG/SVG/JPG only.", variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-xl font-bold text-foreground">White-label Branding</h2>
          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">Enterprise</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Customize your workspace with your own brand, domain, and colors.</p>
      </div>

      {/* Enterprise gate */}
      {!isEnterprise && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">Enterprise plan required</p>
            <p className="text-xs text-amber-300/70 mt-0.5">White-label branding is available on the Enterprise plan. You can preview settings but they won&apos;t be applied until you upgrade.</p>
          </div>
        </div>
      )}

      {/* Logo */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Logo</h3>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
            {config.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logo_url} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <Palette className="w-6 h-6 text-muted-foreground/40" />
            )}
          </div>
          <div className="space-y-1.5">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={logoUploading}
            >
              {logoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {logoUploading ? "Uploading…" : "Upload logo"}
            </Button>
            <p className="text-[11px] text-muted-foreground">PNG, SVG or JPG · Max 2MB · Recommended 256×256</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
            />
          </div>
        </div>
        {config.logo_url && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Or paste URL</label>
            <Input
              value={config.logo_url}
              onChange={(e) => setConfig((c) => ({ ...c, logo_url: e.target.value }))}
              placeholder="https://your-domain.com/logo.png"
              className="h-9 text-xs bg-muted/30 border-border"
            />
          </div>
        )}
      </div>

      {/* Company name */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">Company name</label>
        <Input
          value={config.company_name}
          onChange={(e) => setConfig((c) => ({ ...c, company_name: e.target.value }))}
          placeholder="Acme Agency"
          className="h-9 bg-muted/30 border-border"
        />
        <p className="text-[11px] text-muted-foreground">Replaces "LifemarkAI" in the platform header and emails.</p>
      </div>

      {/* Primary color */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">Primary color</label>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setConfig((c) => ({ ...c, primary_color: color }))}
                className={`w-8 h-8 rounded-lg transition-all ${config.primary_color === color ? "ring-2 ring-white ring-offset-2 ring-offset-background scale-110" : ""}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg border border-border"
              style={{ backgroundColor: config.primary_color }}
            />
            <Input
              value={config.primary_color}
              onChange={(e) => setConfig((c) => ({ ...c, primary_color: e.target.value }))}
              className="h-8 w-28 text-xs font-mono bg-muted/30 border-border"
              placeholder="#8b5cf6"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Applied as the primary accent color across the platform.</p>
      </div>

      {/* Support email */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5" /> Support email
        </label>
        <Input
          value={config.support_email}
          onChange={(e) => setConfig((c) => ({ ...c, support_email: e.target.value }))}
          placeholder="support@your-agency.com"
          type="email"
          className="h-9 bg-muted/30 border-border"
        />
        <p className="text-[11px] text-muted-foreground">Used in automated emails and error pages.</p>
      </div>

      {/* Custom domain */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> Custom dashboard domain
          <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-500/40 text-amber-400">Enterprise</Badge>
        </label>
        <Input
          value={config.custom_domain}
          onChange={(e) => setConfig((c) => ({ ...c, custom_domain: e.target.value }))}
          placeholder="builder.your-agency.com"
          className="h-9 bg-muted/30 border-border"
          disabled={!isEnterprise}
        />
        {config.custom_domain && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1">
            <p className="font-medium text-foreground">DNS Configuration</p>
            <p className="text-muted-foreground">Add this CNAME record to your DNS provider:</p>
            <code className="font-mono text-[10px] bg-muted/40 rounded px-2 py-1 block">
              CNAME {config.custom_domain} → cname.lifemarkai.com
            </code>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Your clients will access the platform at this domain.</p>
      </div>

      {/* Hide powered by */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
        <div className="flex items-center gap-2">
          {config.hide_powered_by ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
          <div>
            <p className="text-sm font-medium text-foreground">Hide "Powered by LifemarkAI"</p>
            <p className="text-xs text-muted-foreground">Remove the LifemarkAI branding from the platform footer and emails</p>
          </div>
        </div>
        <Switch
          checked={config.hide_powered_by}
          onCheckedChange={(v) => setConfig((c) => ({ ...c, hide_powered_by: v }))}
          disabled={!isEnterprise}
        />
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border bg-muted/10 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <p className="text-xs font-medium text-foreground">Brand preview</p>
          <button
            onClick={() => setPreview((v) => !v)}
            className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
          >
            {preview ? "Hide" : "Show"} preview
          </button>
        </div>
        {preview && (
          <div className="p-4">
            <div className="rounded-xl border border-border bg-[#09090b] p-4 space-y-3">
              {/* Mock header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {config.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={config.logo_url} alt="" className="w-6 h-6 rounded" />
                  ) : (
                    <div className="w-6 h-6 rounded" style={{ backgroundColor: config.primary_color }} />
                  )}
                  <span className="text-xs font-semibold text-white">{config.company_name || "Your Company"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/10" />
                </div>
              </div>
              {/* Mock button */}
              <div className="flex gap-2">
                <div
                  className="px-3 py-1.5 rounded-lg text-white text-xs font-medium"
                  style={{ backgroundColor: config.primary_color }}
                >
                  New project
                </div>
                <div className="px-3 py-1.5 rounded-lg text-white/60 text-xs bg-white/5">Dashboard</div>
              </div>
              {!config.hide_powered_by && (
                <p className="text-[9px] text-white/20">Powered by LifemarkAI</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Branded URLs (migration 049 + /api/workspace/branded-urls) — self-saving */}
      <BrandedUrlsSection />

      {/* Save */}
      <div className="flex gap-3">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save branding"}
        </Button>
        {!isEnterprise && (
          <Button variant="outline" className="gap-1.5" asChild>
            <a href="/pricing" target="_blank" rel="noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> Upgrade to Enterprise
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
