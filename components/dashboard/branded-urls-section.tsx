"use client";

/**
 * Branded workspace URLs section.
 *
 * Surfaces the migration 049 + /api/workspace/branded-urls flow:
 *   1. Add a domain (e.g. acme.com) → get a TXT verification record
 *   2. Verify by clicking "Re-check DNS" once the TXT is propagated
 *   3. Enable: derives the subdomain from the verified domain so published
 *      apps live at {app}.{subdomain}.lifemarkai.app
 *
 * The API does all the heavy lifting (TXT verification via dns/promises,
 * subdomain derivation, uniqueness suffixing, lifecycle status updates).
 * This component is just the form + status display.
 *
 * Mount: imported into workspace-branding-page.tsx at the bottom of the
 * existing branding form. Self-contained — only requires no props.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Globe, Copy, Check, RefreshCw, ExternalLink, Plus, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface BrandedConfig {
  branded_subdomain?: string | null;
  branded_source_domain?: string | null;
  branded_status?: string | null; // 'inactive' | 'provisioning_dns' | 'issuing_ssl' | 'active' | 'failed' | 'disabling'
  branded_activated_at?: string | null;
}

interface WorkspaceDomain {
  id: string;
  domain: string;
  verification_token: string;
  verified_at?: string | null;
  created_at: string;
}

interface ApiResponse {
  branded: BrandedConfig;
  domains: WorkspaceDomain[];
}

const STATUS_LABEL: Record<string, { text: string; tone: "active" | "pending" | "inactive" | "danger" }> = {
  inactive: { text: "Inactive", tone: "inactive" },
  provisioning_dns: { text: "Provisioning DNS…", tone: "pending" },
  issuing_ssl: { text: "Issuing SSL…", tone: "pending" },
  active: { text: "Active", tone: "active" },
  failed: { text: "Failed", tone: "danger" },
  disabling: { text: "Disabling…", tone: "pending" },
};

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_LABEL[status] ?? { text: status, tone: "inactive" as const };
  const cls: Record<typeof meta.tone, string> = {
    active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    inactive: "bg-muted text-muted-foreground border-border",
    danger: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls[meta.tone]}`}>
      {meta.text}
    </span>
  );
}

export function BrandedUrlsSection() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [activatingDomain, setActivatingDomain] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workspace/branded-urls");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function addDomain() {
    if (!newDomain.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/workspace/branded-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      toast({
        title: "Domain added",
        description: "Add the TXT record below, then click Verify.",
      });
      setNewDomain("");
      await load();
    } catch (err) {
      toast({
        title: "Couldn't add domain",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  }

  async function verifyDomain(domain: string, id: string) {
    setVerifyingId(id);
    try {
      const res = await fetch("/api/workspace/branded-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, action: "verify" }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({
          title: "Still propagating",
          description: body.hint ?? body.error ?? "TXT record not visible yet.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Domain verified", description: "You can now activate branded URLs from it." });
      await load();
    } finally {
      setVerifyingId(null);
    }
  }

  async function activate(sourceDomain: string) {
    setActivatingDomain(sourceDomain);
    try {
      const res = await fetch("/api/workspace/branded-urls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable: true, sourceDomain }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      toast({
        title: "Branded URLs active",
        description: `Apps publish to {app}.${body.subdomain}.lifemarkai.app`,
      });
      await load();
    } catch (err) {
      toast({
        title: "Couldn't activate",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setActivatingDomain(null);
    }
  }

  async function deactivate() {
    if (!confirm("Disable branded URLs? Apps will revert to <slug>.lifemarkai.app.")) return;
    try {
      const res = await fetch("/api/workspace/branded-urls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable: false }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Branded URLs disabled" });
      await load();
    } catch (err) {
      toast({ title: "Couldn't disable", variant: "destructive" });
    }
  }

  async function removeDomain(domain: string) {
    if (!confirm(`Remove ${domain}? Active branded URLs derived from this domain will be disabled.`)) return;
    try {
      await fetch(`/api/workspace/branded-urls?domain=${encodeURIComponent(domain)}`, { method: "DELETE" });
      toast({ title: `${domain} removed` });
      await load();
    } catch {
      toast({ title: "Couldn't remove", variant: "destructive" });
    }
  }

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((curr) => curr === key ? null : curr), 1500);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const branded = data?.branded ?? {};
  const domains = data?.domains ?? [];
  const isActive = branded.branded_status === "active" && branded.branded_subdomain;

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold">Branded workspace URLs</h3>
            {branded.branded_status && <StatusPill status={branded.branded_status} />}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Publish apps to <code className="text-[10px]">{`{app}.{your-subdomain}.lifemarkai.app`}</code>{" "}
            once you verify a domain.
          </p>
        </div>
        {isActive && (
          <Button size="sm" variant="ghost" className="h-7 text-[11px] text-red-400" onClick={deactivate}>
            Disable
          </Button>
        )}
      </div>

      {isActive && (
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-300">Active subdomain</span>
          </div>
          <div className="flex items-center gap-1">
            <code className="flex-1 text-[11px] font-mono bg-background/60 border border-emerald-500/20 rounded px-2 py-1 truncate">
              {`*.${branded.branded_subdomain}.lifemarkai.app`}
            </code>
            <button
              onClick={() => copy(`${branded.branded_subdomain}.lifemarkai.app`, "active-sub")}
              className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground"
            >
              {copiedKey === "active-sub" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Derived from <code className="text-[10px]">{branded.branded_source_domain}</code>
          </p>
        </div>
      )}

      {/* Add new domain */}
      <div className="flex items-center gap-2">
        <input
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void addDomain()}
          placeholder="acme.com"
          className="flex-1 h-8 px-2.5 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={() => void addDomain()}
          disabled={adding || !newDomain.trim()}
        >
          {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
          Add domain
        </Button>
      </div>

      {/* Domain list */}
      {domains.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-2">No domains added yet.</p>
      ) : (
        <div className="space-y-2">
          {domains.map((d) => {
            const verified = !!d.verified_at;
            const isSource = d.domain === branded.branded_source_domain;
            const txtName = `_lifemark.${d.domain}`;
            return (
              <div key={d.id} className="rounded-lg border border-border/60 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-mono flex-1 truncate">{d.domain}</span>
                  {verified ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      Verified
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      Pending
                    </span>
                  )}
                  {isSource && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      Source
                    </span>
                  )}
                  {!verified && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => void verifyDomain(d.domain, d.id)}
                      disabled={verifyingId === d.id}
                    >
                      {verifyingId === d.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      <span className="ml-1">Verify</span>
                    </Button>
                  )}
                  {verified && !isActive && (
                    <Button
                      size="sm"
                      className="h-7 px-2 text-[11px] bg-violet-600 hover:bg-violet-500 text-white"
                      onClick={() => void activate(d.domain)}
                      disabled={activatingDomain === d.domain}
                    >
                      {activatingDomain === d.domain ? <Loader2 className="w-3 h-3 animate-spin" /> : "Use as subdomain"}
                    </Button>
                  )}
                  <button
                    onClick={() => void removeDomain(d.domain)}
                    className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-red-400"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                {!verified && (
                  <div className="px-3 pb-3 bg-muted/10 space-y-2 border-t border-border/40">
                    <p className="text-[10px] text-muted-foreground pt-2">
                      Add this TXT record at your DNS provider, then click Verify.
                    </p>
                    <div className="rounded border border-border overflow-hidden text-[10px] font-mono">
                      <div className="grid grid-cols-[60px_1fr_24px] gap-1 px-2 py-1 bg-muted/40">
                        <span className="text-muted-foreground">Type</span>
                        <span>TXT</span>
                        <span />
                      </div>
                      <div className="grid grid-cols-[60px_1fr_24px] gap-1 px-2 py-1 border-t border-border/40">
                        <span className="text-muted-foreground">Name</span>
                        <span className="truncate">{txtName}</span>
                        <button onClick={() => copy(txtName, `n-${d.id}`)} className="text-muted-foreground hover:text-foreground">
                          {copiedKey === `n-${d.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <div className="grid grid-cols-[60px_1fr_24px] gap-1 px-2 py-1 border-t border-border/40">
                        <span className="text-muted-foreground">Value</span>
                        <span className="truncate">{d.verification_token}</span>
                        <button onClick={() => copy(d.verification_token, `v-${d.id}`)} className="text-muted-foreground hover:text-foreground">
                          {copiedKey === `v-${d.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2 flex items-start gap-2">
        <AlertCircle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-amber-200/90">
          DNS propagation can take a few minutes. Once verified, &ldquo;Use as subdomain&rdquo; activates branded
          URLs for all published apps in this workspace.{" "}
          <a
            href="https://docs.lifemarkai.com/workspace/branded-urls"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-300 hover:underline"
          >
            Docs <ExternalLink className="w-2.5 h-2.5 inline" />
          </a>
        </p>
      </div>
    </div>
  );
}
