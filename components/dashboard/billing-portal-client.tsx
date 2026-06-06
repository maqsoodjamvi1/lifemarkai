"use client";

import { useState } from "react";
import {
  CreditCard, Zap, TrendingDown, ExternalLink, Check,
  Loader2, ChevronRight, Receipt, BarChart3, ArrowUpRight,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { Plan } from "@/lib/stripe/plans";

interface BillingPortalClientProps {
  user: { id: string; email: string };
  currentPlan: Plan;
  credits: number;
  hasStripe: boolean;
  creditLogs: { amount: number; reason: string; created_at: string }[];
  plans: Plan[];
}

const CREDIT_PACKS = [
  { id: "pack_100",  credits: 100,  price: 5,  label: "Starter" },
  { id: "pack_500",  credits: 500,  price: 19, label: "Builder" },
  { id: "pack_2000", credits: 2000, price: 59, label: "Power", badge: "Best value" },
];

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function BillingPortalClient({
  currentPlan, credits, hasStripe, creditLogs, plans,
}: BillingPortalClientProps) {
  const [openingPortal, setOpeningPortal] = useState(false);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  async function openStripePortal() {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not open portal");
      window.open(data.url, "_blank");
    } catch (err) {
      toast({ title: "Failed to open billing portal", description: String(err), variant: "destructive" });
    } finally {
      setOpeningPortal(false);
    }
  }

  async function buyPack(packId: string) {
    setBuyingPack(packId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "credits", packId }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      toast({ title: "Checkout failed", description: String(err), variant: "destructive" });
    } finally {
      setBuyingPack(null);
    }
  }

  async function upgradePlan(planId: string) {
    setUpgrading(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "subscription", planId }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      toast({ title: "Upgrade failed", description: String(err), variant: "destructive" });
    } finally {
      setUpgrading(null);
    }
  }

  // Build credit usage bars for last 7 days
  const usageByDay: Record<string, number> = {};
  for (const log of creditLogs) {
    if (log.amount >= 0) continue; // only debits
    const day = new Date(log.created_at).toLocaleDateString("en", { weekday: "short" });
    usageByDay[day] = (usageByDay[day] ?? 0) + Math.abs(log.amount);
  }
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const maxUsage = Math.max(...Object.values(usageByDay), 1);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your plan, credits, and payment details</p>
        </div>

        {/* Current plan + credits row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Plan card */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Current plan</p>
                <h2 className="text-xl font-bold text-foreground">{currentPlan.name}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{currentPlan.tagline}</p>
              </div>
              <Badge
                variant="outline"
                className={`text-xs ${currentPlan.id === "free" ? "border-border text-muted-foreground" : "border-violet-500/40 text-violet-400"}`}
              >
                {currentPlan.id === "free" ? "Free" : `$${currentPlan.monthlyPrice / 100}/mo`}
              </Badge>
            </div>

            <div className="space-y-1.5 mb-5">
              {currentPlan.features.slice(0, 4).map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> {f}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              {hasStripe && (
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" onClick={openStripePortal} disabled={openingPortal}>
                  {openingPortal ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
                  Manage billing
                </Button>
              )}
              {currentPlan.id === "free" && (
                <Button size="sm" className="flex-1 gap-1.5 text-xs bg-violet-600 hover:bg-violet-700" onClick={() => upgradePlan("pro")} disabled={!!upgrading}>
                  {upgrading === "pro" ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpRight className="w-3 h-3" />}
                  Upgrade to Pro
                </Button>
              )}
            </div>
          </div>

          {/* Credits card */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">AI Credits</p>
                <h2 className="text-3xl font-bold text-foreground">{credits.toLocaleString()}</h2>
                <p className="text-xs text-muted-foreground mt-1">Resets monthly · {currentPlan.credits}/mo on {currentPlan.name}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
            </div>

            {/* Credit bar */}
            <div className="mb-4">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
                  style={{ width: `${Math.min(100, (credits / currentPlan.credits) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{credits} / {currentPlan.credits} remaining</p>
            </div>
          </div>
        </div>

        {/* Credit packs */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-400" /> Credit packs
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Top up anytime — credits never expire</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {CREDIT_PACKS.map((pack) => (
              <div key={pack.id} className={`relative rounded-xl border p-4 ${pack.badge ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card"}`}>
                {pack.badge && (
                  <Badge variant="outline" className="absolute -top-2 left-3 text-[10px] h-4 px-1.5 border-amber-500/40 text-amber-400 bg-background">
                    {pack.badge}
                  </Badge>
                )}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{pack.label}</p>
                    <p className="text-lg font-bold text-foreground">{pack.credits.toLocaleString()} credits</p>
                  </div>
                  <p className="text-base font-semibold text-foreground">${pack.price}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mb-3">${(pack.price / pack.credits * 100).toFixed(1)}¢ per credit</p>
                <Button
                  size="sm"
                  className="w-full text-xs gap-1"
                  variant={pack.badge ? "default" : "outline"}
                  onClick={() => buyPack(pack.id)}
                  disabled={buyingPack === pack.id}
                >
                  {buyingPack === pack.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Buy for ${pack.price}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Usage chart */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-400" /> Weekly usage
          </h2>
          <div className="flex items-end gap-2 h-24">
            {days.map((day) => {
              const val = usageByDay[day] ?? 0;
              const pct = (val / maxUsage) * 100;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end" style={{ height: "72px" }}>
                    <div
                      className="w-full rounded-t-sm bg-gradient-to-t from-blue-600 to-blue-400 transition-all"
                      style={{ height: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground">{day}</span>
                  {val > 0 && <span className="text-[9px] text-blue-400">{val}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Plan upgrades */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-violet-400" /> Available plans
          </h2>
          <div className="space-y-3">
            {plans.filter((p) => p.id !== "free").map((plan) => (
              <div key={plan.id} className={`rounded-xl border p-4 flex items-center gap-4 ${plan.id === currentPlan.id ? "border-violet-500/30 bg-violet-500/5" : "border-border bg-card"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                    {plan.id === currentPlan.id && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-violet-500/40 text-violet-400">Current</Badge>}
                    {plan.badge && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/40 text-amber-400">{plan.badge}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{plan.tagline} · {plan.credits.toLocaleString()} credits/mo</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-foreground">${plan.monthlyPrice / 100}<span className="text-xs text-muted-foreground font-normal">/mo</span></p>
                </div>
                {plan.id !== currentPlan.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1 text-xs"
                    onClick={() => upgradePlan(plan.id)}
                    disabled={!!upgrading}
                  >
                    {upgrading === plan.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                    {plan.monthlyPrice > currentPlan.monthlyPrice ? "Upgrade" : "Switch"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Credit history */}
        {creditLogs.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-muted-foreground" /> Recent credit activity
            </h2>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Action</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Credits</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {creditLogs.slice(0, 15).map((log, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/5 transition-colors">
                      <td className="px-4 py-2.5 text-foreground capitalize">{log.reason.replace(/_/g, " ")}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-medium ${log.amount < 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {log.amount > 0 ? "+" : ""}{log.amount}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{timeAgo(log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
