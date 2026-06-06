// @ts-nocheck
"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, Loader2, CheckCircle2, Copy, Check,
  ExternalLink, RefreshCw, Pencil, X, ShoppingCart,
  Link2, MoreHorizontal, Star, Trash2, AlertCircle, Code2,
  Twitter, Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@/types/database";

interface DomainsPanelProps {
  project: Project;
  onProjectUpdate?: (p: Partial<Project>) => void;
}

interface DnsRecord {
  type: string;
  name: string;
  value: string;
}

interface CustomDomain {
  domain: string;
  wwwDomain: string;
  status: "live" | "pending" | "error";
  wwwStatus: "live" | "pending" | "error";
  isPrimary: boolean;
  dnsRecords: DnsRecord[];
  checking?: boolean;
}

function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Domain status row ─────────────────────────────────────────────────────────
// Renders one line per host inside the custom-domain card: a green check when
// the host resolves to Lifemark, otherwise a red x with an inline Connect
// affordance (matches Lovable's "www.lifemarkcargoflow.com — Not connected — [Connect]"
// row from screenshot 6). The Connect button just expands the form-row UI; it
// links the user to the same DNS instructions for the apex.
function DomainStatusRow({
  domain,
  status,
  copied,
  onCopy,
  onConnect,
}: {
  domain: string;
  status: "live" | "pending" | "error";
  copied: string | null;
  onCopy: (text: string) => void;
  onConnect?: () => void;
}) {
  const isLive = status === "live";
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {isLive ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
      ) : (
        <X className="w-3.5 h-3.5 text-red-500 shrink-0" />
      )}
      <span className="text-[11px] font-mono truncate flex-1">{domain}</span>
      {isLive ? (
        <span className="text-[10px] text-muted-foreground shrink-0">Your site is live on this domain.</span>
      ) : (
        <span className="text-[10px] text-muted-foreground shrink-0">Not connected.</span>
      )}
      {!isLive && onConnect && (
        <button
          onClick={onConnect}
          className="text-[11px] px-2 py-0.5 rounded border border-border hover:border-border/80 hover:bg-muted/40 text-foreground transition-colors shrink-0"
        >
          Connect
        </button>
      )}
      <button
        onClick={() => onCopy(`https://${domain}`)}
        className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Copy URL"
      >
        {copied === `https://${domain}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

// ── Share & Embed card ────────────────────────────────────────────────────────
function ShareEmbedCard({ hostedUrl, projectName }: { hostedUrl: string; projectName: string }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const embedCode = `<iframe
  src="${hostedUrl}"
  width="100%"
  height="600"
  frameborder="0"
  allowfullscreen
  title="${projectName}"
></iframe>`;

  const tweetText = `Check out ${projectName} — built with AI on LifemarkAI ✨\n${hostedUrl}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold">Share & Embed</p>
      </div>

      {/* Share link row */}
      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Share link</p>
        <div className="flex items-center gap-1.5 bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5">
          <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] font-mono text-foreground/80 flex-1 truncate">{hostedUrl}</span>
          <button
            onClick={() => copy("link", hostedUrl)}
            className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
          >
            {copiedKey === "link" ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Embed code */}
      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Embed code</p>
        <div className="relative rounded-lg bg-[#0d0d14] border border-border/50 overflow-hidden">
          <pre className="text-[10px] font-mono text-[#a6adc8] p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
            {embedCode}
          </pre>
          <button
            onClick={() => copy("embed", embedCode)}
            className="absolute top-2 right-2 p-1.5 rounded bg-[#1e1e2e] border border-[#313244] hover:bg-[#313244] transition-colors"
          >
            {copiedKey === "embed" ? <Check className="w-3 h-3 text-green-400" /> : <Code2 className="w-3 h-3 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Social share */}
      <div className="flex items-center gap-2">
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[#1DA1F2]/10 border border-[#1DA1F2]/30 text-[#1DA1F2] hover:bg-[#1DA1F2]/20 transition-colors font-medium"
        >
          <Twitter className="w-3 h-3" />
          Share on X
        </a>
        <a
          href={hostedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-muted/50 border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Open live app
        </a>
      </div>
    </div>
  );
}

export function DomainsPanel({ project, onProjectUpdate }: DomainsPanelProps) {
  // ── Hosted URL (slug) editing ─────────────────────────────────────────────
  const [slug, setSlug] = useState<string>(
    project.slug ?? slugify(project.name) + "-" + project.id.slice(0, 8)
  );
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugInput, setSlugInput] = useState(slug);
  const [slugSaving, setSlugSaving] = useState(false);
  const slugInputRef = useRef<HTMLInputElement>(null);

  // ── Custom domains ────────────────────────────────────────────────────────
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [connectInput, setConnectInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState<string | null>(null);

  const { toast } = useToast();

  const hostedUrl = `https://${slug}.lifemarkai.app`;

  // ── Load custom domains ───────────────────────────────────────────────────
  useEffect(() => {
    void loadDomains();
  }, [project.id]);

  async function loadDomains() {
    setLoadingDomains(true);
    try {
      const res = await fetch(`/api/domains?projectId=${project.id}`);
      if (!res.ok) return;
      const data = await res.json() as {
        customDomain: string | null;
        deployedUrl: string | null;
        dnsInstructions?: DnsRecord[];
      };
      if (data.customDomain) {
        setDomains([{
          domain: data.customDomain,
          wwwDomain: `www.${data.customDomain}`,
          status: "live",
          wwwStatus: "pending",
          isPrimary: true,
          dnsRecords: data.dnsInstructions ?? [],
        }]);
      }
    } finally {
      setLoadingDomains(false);
    }
  }

  // ── Slug editing ──────────────────────────────────────────────────────────
  function startEditSlug() {
    setSlugInput(slug);
    setEditingSlug(true);
    setTimeout(() => slugInputRef.current?.select(), 50);
  }

  async function saveSlug() {
    const newSlug = slugify(slugInput);
    if (!newSlug || newSlug === slug) { setEditingSlug(false); return; }
    setSlugSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newSlug }),
      });
      if (!res.ok) throw new Error("Failed to update URL");
      setSlug(newSlug);
      onProjectUpdate?.({ slug: newSlug });
      toast({ title: "URL updated", description: `Your app is now at ${newSlug}.lifemarkai.app` });
    } catch {
      toast({ title: "Failed to update URL", variant: "destructive" });
    } finally {
      setSlugSaving(false);
      setEditingSlug(false);
    }
  }

  // ── Connect domain ────────────────────────────────────────────────────────
  async function connectDomain() {
    const domain = connectInput.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!domain) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, domain }),
      });
      const data = await res.json() as {
        domain: string;
        dnsInstructions: DnsRecord[];
        error?: string;
      };
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Failed to connect domain", variant: "destructive" });
        return;
      }
      setDomains((prev) => [
        ...prev.filter((d) => d.domain !== domain),
        {
          domain,
          wwwDomain: `www.${domain}`,
          status: "pending",
          wwwStatus: "pending",
          isPrimary: prev.length === 0,
          dnsRecords: data.dnsInstructions ?? [],
        },
      ]);
      setConnectInput("");
      setShowConnect(false);
      toast({ title: "Domain connected", description: "Add the DNS records shown below to activate it." });
    } finally {
      setConnecting(false);
    }
  }

  async function removeDomain(domain: string) {
    await fetch(`/api/domains?projectId=${project.id}`, { method: "DELETE" });
    setDomains((prev) => prev.filter((d) => d.domain !== domain));
    setOpenMenu(null);
    toast({ title: "Domain removed" });
  }

  async function verifyDomain(domain: string) {
    setDomains((prev) =>
      prev.map((d) => d.domain === domain ? { ...d, checking: true } : d)
    );
    try {
      const res = await fetch("/api/domains/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, projectId: project.id }),
      });
      const data = await res.json() as { resolved: boolean; resolvedTo?: string; error?: string; message: string };
      setDomains((prev) =>
        prev.map((d) =>
          d.domain === domain
            ? { ...d, status: data.resolved ? "live" : "pending", checking: false }
            : d
        )
      );
      toast({
        title: data.resolved ? "✅ Domain is live!" : "Still propagating",
        description: data.message,
        variant: data.resolved ? "default" : "default",
      });
    } catch {
      setDomains((prev) => prev.map((d) => d.domain === domain ? { ...d, checking: false } : d));
      toast({ title: "Could not verify domain", description: "Try again or check manually with MXToolbox.", variant: "destructive" });
    }
  }

  function doCopy(text: string) {
    void copyToClipboard(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Domains</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Open docs link — matches Lovable's "Open docs" affordance in the Domains page header */}
          <a
            href="https://docs.lifemarkai.com/domains"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 h-7 rounded"
          >
            Open docs
            <ExternalLink className="w-3 h-3" />
          </a>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={loadDomains}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* ── Project hosted URL ──────────────────────────────────────────── */}
        <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Globe className="w-2.5 h-2.5 text-muted-foreground" />
            </div>
            {editingSlug ? (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-xs text-muted-foreground font-mono shrink-0">https://</span>
                <Input
                  ref={slugInputRef}
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveSlug();
                    if (e.key === "Escape") setEditingSlug(false);
                  }}
                  className="h-6 text-xs font-mono px-1.5 py-0 border-primary/50 bg-muted/30"
                  placeholder="my-app"
                  disabled={slugSaving}
                />
                <span className="text-xs text-muted-foreground font-mono shrink-0">.lifemarkai.app</span>
                <Button size="icon" className="h-6 w-6 shrink-0 bg-primary/80 hover:bg-primary" onClick={() => void saveSlug()} disabled={slugSaving}>
                  {slugSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setEditingSlug(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <a
                href={hostedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-violet-400 hover:underline truncate flex-1"
              >
                {hostedUrl}
              </a>
            )}
            {!editingSlug && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={startEditSlug}
                >
                  Edit URL
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ── Custom Domains ──────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-foreground">Custom domains</h3>

          {loadingDomains && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingDomains && domains.length === 0 && !showConnect && (
            <p className="text-xs text-muted-foreground">No custom domains connected yet.</p>
          )}

          <AnimatePresence initial={false}>
            {domains.map((d) => (
              <motion.div
                key={d.domain}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="rounded-xl border border-border/60 overflow-hidden"
              >
                {/* Domain header row */}
                <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/10">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${d.status === "live" ? "bg-green-500" : "bg-yellow-400 animate-pulse"}`} />
                  <a
                    href={`https://${d.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono font-medium hover:underline truncate flex-1"
                  >
                    {d.domain}
                  </a>
                  {d.isPrimary && (
                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" title="Primary domain" />
                  )}
                  <div className="relative shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setOpenMenu(openMenu === d.domain ? null : d.domain)}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </Button>
                    <AnimatePresence>
                      {openMenu === d.domain && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="absolute right-0 top-7 z-50 min-w-[140px] rounded-lg border border-border bg-popover shadow-lg py-1"
                        >
                          <button
                            onClick={() => doCopy(`https://${d.domain}`)}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                          >
                            <Copy className="w-3 h-3" /> Copy URL
                          </button>
                          <button
                            onClick={() => void removeDomain(d.domain)}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-destructive hover:bg-muted/50 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Status rows */}
                <div className="border-t border-border/40 divide-y divide-border/30">
                  <DomainStatusRow
                    domain={d.domain}
                    status={d.status}
                    copied={copied}
                    onCopy={doCopy}
                    onConnect={() => void verifyDomain(d.domain)}
                  />
                  <DomainStatusRow
                    domain={d.wwwDomain}
                    status={d.wwwStatus}
                    copied={copied}
                    onCopy={doCopy}
                    onConnect={() => void verifyDomain(d.domain)}
                  />
                </div>

                {/* DNS records (if pending) */}
                {(d.status === "pending" || d.wwwStatus === "pending") && d.dnsRecords.length > 0 && (
                  <div className="border-t border-border/40 p-3 space-y-2 bg-muted/5">
                    <p className="text-[11px] text-muted-foreground font-medium">Add these DNS records at your registrar:</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-3 px-2.5 py-1.5 bg-muted/40 text-[10px] font-semibold text-muted-foreground border-b border-border">
                        <span>Type</span><span>Name</span><span>Value</span>
                      </div>
                      {d.dnsRecords.map((r, i) => (
                        <div key={i} className="grid grid-cols-3 px-2.5 py-1.5 text-[11px] font-mono border-b border-border/40 last:border-0 hover:bg-muted/20 group">
                          <span className="text-violet-400 font-semibold">{r.type}</span>
                          <span className="truncate text-muted-foreground">{r.name}</span>
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="truncate flex-1">{r.value}</span>
                            <button onClick={() => doCopy(r.value)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                              {copied === r.value ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">DNS propagation takes 1–60 minutes. SSL provisions automatically.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1 shrink-0"
                        disabled={d.checking}
                        onClick={() => void verifyDomain(d.domain)}
                      >
                        <RefreshCw className={`w-3 h-3 ${d.checking ? "animate-spin" : ""}`} />
                        {d.checking ? "Checking…" : "Re-check DNS"}
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Connect existing domain form */}
          <AnimatePresence>
            {showConnect && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-border/60 p-3 space-y-2 bg-muted/10">
                  <p className="text-xs font-medium">Enter your domain</p>
                  <div className="flex gap-2">
                    <Input
                      value={connectInput}
                      onChange={(e) => setConnectInput(e.target.value)}
                      placeholder="myapp.com"
                      className="h-8 text-xs font-mono"
                      onKeyDown={(e) => e.key === "Enter" && void connectDomain()}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-8 px-3 text-xs bg-foreground text-background hover:bg-foreground/90"
                      onClick={() => void connectDomain()}
                      disabled={connecting || !connectInput.trim()}
                    >
                      {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Connect"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setShowConnect(false)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Works with apex (myapp.com) and subdomains (app.mysite.com)</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Share & Embed ───────────────────────────────────────────────── */}
        <ShareEmbedCard hostedUrl={hostedUrl} projectName={project.name} />

        {/* ── Buy a new domain ────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold">Buy a new domain</p>
                <span className="text-[10px] bg-violet-500/15 text-violet-400 border border-violet-500/25 px-1.5 py-0.5 rounded-full">Pro</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Buy and automatically connect a new domain.</p>
            </div>
            <Button
              size="sm"
              className="h-8 px-3 text-xs bg-foreground text-background hover:bg-foreground/90 shrink-0"
              onClick={() => window.open(`https://www.namecheap.com/domains/registration/results/?domain=${slugify(project.name)}`, "_blank")}
            >
              <ShoppingCart className="w-3 h-3 mr-1" />
              Buy domain
            </Button>
          </div>
        </div>

        {/* ── Connect existing domain ─────────────────────────────────────── */}
        <div className="rounded-xl border border-border/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold">Connect existing domain</p>
                <span className="text-[10px] bg-violet-500/15 text-violet-400 border border-violet-500/25 px-1.5 py-0.5 rounded-full">Pro</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Connect a domain you own from any provider.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs shrink-0"
              onClick={() => setShowConnect(true)}
            >
              Connect domain
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
