"use client";

import { useState, useEffect } from "react";
import { DollarSign, Loader2, Check, ExternalLink, Users, TrendingUp, Lock, Unlock, CreditCard, Calendar, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

interface MonetizationPanelProps {
  projectId: string;
  projectSlug: string;
}

interface MonetizationConfig {
  enabled: boolean;
  price_cents: number;
  currency: string;
  trial_days: number;
  stripe_price_id?: string;
  stripe_product_id?: string;
}

interface Subscriber {
  subscriber_email: string;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  created_at: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = { usd: "$", eur: "€", gbp: "£", cad: "CA$" };

export function MonetizationPanel({ projectId, projectSlug }: MonetizationPanelProps) {
  const [config, setConfig] = useState<MonetizationConfig>({
    enabled: false,
    price_cents: 900,
    currency: "usd",
    trial_days: 7,
  });
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"settings" | "subscribers">("settings");
  const [priceInput, setPriceInput] = useState("9.00");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/monetization`);
        if (res.ok) {
          const data = await res.json() as { config: MonetizationConfig; subscribers: Subscriber[] };
          setConfig(data.config);
          setSubscribers(data.subscribers ?? []);
          setPriceInput((data.config.price_cents / 100).toFixed(2));
        }
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    }
    load();
  }, [projectId]);

  async function save() {
    setSaving(true);
    const priceCents = Math.round(parseFloat(priceInput) * 100);
    const next = { ...config, price_cents: isNaN(priceCents) ? 0 : priceCents };
    try {
      const res = await fetch(`/api/projects/${projectId}/monetization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error();
      setConfig(next);
      toast({ title: "Monetization saved", description: next.enabled ? "Paywall is now active on your app." : "Paywall disabled." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally { setSaving(false); }
  }

  const embedScript = `<script src="https://lifemarkai.com/embed/paywall.js" data-project="${projectSlug}"></script>`;
  const appUrl = `${typeof window !== "undefined" ? window.location.origin : "https://lifemarkai.com"}/app/${projectSlug}`;
  const sym = CURRENCY_SYMBOLS[config.currency] ?? "$";

  const mrr = subscribers.filter((s) => s.status === "active" || s.status === "trialing").length * (config.price_cents / 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <h2 className="font-semibold text-foreground">App Monetization</h2>
          <Badge
            variant="outline"
            className={`text-[10px] h-4 px-1.5 ${config.enabled ? "border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground"}`}
          >
            {config.enabled ? "Active" : "Inactive"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Add a Stripe paywall to your published app</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        {[
          { label: "Subscribers", value: subscribers.length, icon: Users },
          { label: "MRR", value: `${sym}${mrr.toFixed(0)}`, icon: TrendingUp },
          { label: "Trial Days", value: config.trial_days, icon: Calendar },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Icon className="w-3 h-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
            <p className="text-lg font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-border">
        {(["settings", "subscribers"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
              activeTab === tab ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "settings" ? (
          <>
            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
              <div className="flex items-center gap-2">
                {config.enabled ? <Lock className="w-4 h-4 text-amber-400" /> : <Unlock className="w-4 h-4 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-medium text-foreground">Paywall enabled</p>
                  <p className="text-xs text-muted-foreground">Visitors must subscribe to access the app</p>
                </div>
              </div>
              <Switch
                checked={config.enabled}
                onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
              />
            </div>

            {/* Price */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Monthly Price</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{sym}</span>
                  <Input
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    className="pl-7 h-9 bg-muted/30 border-border"
                    placeholder="9.00"
                  />
                </div>
                <select
                  value={config.currency}
                  onChange={(e) => setConfig((c) => ({ ...c, currency: e.target.value }))}
                  className="h-9 px-2 rounded-md border border-border bg-muted/30 text-sm text-foreground"
                >
                  {Object.entries(CURRENCY_SYMBOLS).map(([code, sym]) => (
                    <option key={code} value={code}>{code.toUpperCase()} ({sym})</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-muted-foreground">Set to 0 for a free-with-signup gate</p>
            </div>

            {/* Trial */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Free Trial (days)</label>
              <Input
                type="number"
                min={0}
                max={90}
                value={config.trial_days}
                onChange={(e) => setConfig((c) => ({ ...c, trial_days: parseInt(e.target.value) || 0 }))}
                className="h-9 bg-muted/30 border-border"
              />
            </div>

            {/* Stripe note */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300 space-y-1">
              <p className="font-medium flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" />Stripe Connect required</p>
              <p className="text-amber-300/70">Payments go directly to your Stripe account. Connect Stripe in Settings → Integrations to activate billing.</p>
            </div>

            {/* Embed snippet */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Embed snippet</label>
              <div className="relative rounded-lg border border-border bg-muted/20 p-3 font-mono text-[10px] text-foreground">
                {embedScript}
                <button
                  onClick={() => { navigator.clipboard.writeText(embedScript); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="absolute top-2 right-2"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">Add this to your app's HTML to enable the paywall overlay.</p>
            </div>

            {/* App link */}
            <a
              href={appUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Preview published app
            </a>
          </>
        ) : (
          <>
            {subscribers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Users className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">No subscribers yet</p>
                <p className="text-xs text-muted-foreground max-w-xs">Enable the paywall and share your app link to start getting subscribers.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => { navigator.clipboard.writeText(appUrl); toast({ title: "Link copied!" }); }}
                >
                  <Copy className="w-3.5 h-3.5" /> Copy app link
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {subscribers.map((sub) => (
                  <div key={sub.subscriber_email} className="rounded-lg border border-border bg-muted/20 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground truncate max-w-[160px]">{sub.subscriber_email}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Since {new Date(sub.created_at).toLocaleDateString()}
                        {sub.trial_end && new Date(sub.trial_end) > new Date() && " · Trial"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] h-4 px-1.5 ${
                        sub.status === "active"   ? "border-emerald-500/40 text-emerald-400" :
                        sub.status === "trialing" ? "border-sky-500/40 text-sky-400" :
                        sub.status === "past_due" ? "border-amber-500/40 text-amber-400" :
                        "border-red-500/40 text-red-400"
                      }`}
                    >
                      {sub.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Save */}
      {activeTab === "settings" && (
        <div className="p-4 border-t border-border">
          <Button size="sm" className="w-full gap-1.5" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Save monetization settings"}
          </Button>
        </div>
      )}
    </div>
  );
}
