"use client";

import { useState } from "react";
import {
  CreditCard, CheckCircle2, Zap, Building2, Shield, Check,
  ChevronDown, ChevronUp, ArrowRight, Star, Users, ExternalLink,
  Sparkles, Loader2,
} from "lucide-react";
import { PLANS } from "@/lib/stripe/plans";
import type { Profile } from "@/types/database";

/* ─── Types ─────────────────────────────────────────────── */

interface PaymentsPanelProps {
  profile: Profile | null;
}

/* ─── Component ─────────────────────────────────────────── */

export function PaymentsPanel({ profile }: PaymentsPanelProps) {
  const [selectedPlan, setSelectedPlan] = useState<string>(profile?.plan ?? "pro");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const currentPlan = profile?.plan ?? "free";
  const credits     = profile?.credits ?? 0;

  const planColors: Record<string, string> = {
    free:       "text-muted-foreground",
    pro:        "text-violet-400",
    team:       "text-indigo-400",
    enterprise: "text-purple-400",
  };

  const planBgColors: Record<string, string> = {
    free:       "bg-muted/50 border-border",
    pro:        "bg-violet-500/10 border-violet-500/30",
    team:       "bg-indigo-500/10 border-indigo-500/30",
    enterprise: "bg-purple-500/10 border-purple-500/30",
  };

  const handleUpgrade = async () => {
    if (selectedPlan === currentPlan || selectedPlan === "free") return;
    setIsRedirecting(true);
    try {
      const res = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan, interval: "monthly" }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) window.open(data.url, "_blank");
    } catch {
      /* handled by redirect failure */
    } finally {
      setIsRedirecting(false);
    }
  };

  const handleManageBilling = () => {
    window.open("/dashboard/billing", "_blank");
  };

  /* Usage stats (mock based on profile data) */
  const usageStats = [
    { label: "Credits remaining", used: credits, limit: PLANS.find((p) => p.id === currentPlan)?.credits ?? 50, color: "bg-violet-400" },
    { label: "Projects",          used: 0,        limit: PLANS.find((p) => p.id === currentPlan)?.maxProjects ?? 3, color: "bg-blue-400" },
  ];

  return (
    <div className="h-full flex flex-col text-foreground">
      {/* Header */}
      <div className="p-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <CreditCard size={14} className="text-violet-400" />
          <h3 className="text-[12px] font-semibold">Billing &amp; Plans</h3>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Manage your subscription and usage.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Current plan badge */}
        <div className={`p-2.5 rounded-xl border ${planBgColors[currentPlan]}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={12} className={planColors[currentPlan]} />
              <span className={`text-[10px] font-semibold ${planColors[currentPlan]}`}>
                Current: {PLANS.find((p) => p.id === currentPlan)?.name ?? "Free"} Plan
              </span>
            </div>
            <button
              onClick={handleManageBilling}
              className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition"
            >
              Manage <ExternalLink size={8} className="ml-0.5" />
            </button>
          </div>
          {/* Credits bar */}
          <div className="mt-2">
            <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
              <span>Credits</span>
              <span>{credits.toLocaleString()} / {(PLANS.find((p) => p.id === currentPlan)?.credits ?? 50).toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${planColors[currentPlan].replace("text-", "bg-")} rounded-full transition-all`}
                style={{ width: `${Math.min((credits / (PLANS.find((p) => p.id === currentPlan)?.credits ?? 50)) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Plan selection */}
        <div className="space-y-2">
          {PLANS.map((plan) => {
            const priceDisplay = plan.monthlyPrice === 0
              ? "$0"
              : `$${(plan.monthlyPrice / 100).toFixed(0)}`;
            const isActive  = plan.id === currentPlan;
            const isSelected = plan.id === selectedPlan;

            return (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full p-3 rounded-xl border-2 transition text-left ${
                  isSelected
                    ? "border-violet-500/50 bg-violet-500/10"
                    : "border-border hover:border-border/80"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${planColors[plan.id]}`}>{plan.name}</span>
                    {isActive && (
                      <span className="text-[7px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full font-medium">
                        Active
                      </span>
                    )}
                    {plan.badge && !isActive && (
                      <span className="text-[7px] px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded-full font-medium">
                        {plan.badge}
                      </span>
                    )}
                    {isSelected && !isActive && <CheckCircle2 size={12} className="text-violet-400" />}
                  </div>
                  <div className="text-right">
                    <span className={`text-lg font-bold ${planColors[plan.id]}`}>{priceDisplay}</span>
                    {plan.monthlyPrice > 0 && (
                      <span className="text-[9px] text-muted-foreground">/mo</span>
                    )}
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">{plan.tagline}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {plan.features.slice(0, 4).map((f) => (
                    <span
                      key={f}
                      className="text-[8px] px-1.5 py-0.5 bg-background border border-border rounded-full text-muted-foreground flex items-center gap-0.5"
                    >
                      <Check size={7} className="text-green-400" /> {f}
                    </span>
                  ))}
                  {plan.features.length > 4 && (
                    <span className="text-[8px] text-muted-foreground px-1">
                      +{plan.features.length - 4} more
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Upgrade CTA */}
        {selectedPlan !== currentPlan && selectedPlan !== "free" && (
          <button
            onClick={handleUpgrade}
            disabled={isRedirecting}
            className="w-full py-2.5 bg-violet-500 text-white text-[11px] font-semibold rounded-xl hover:bg-violet-600 transition flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {isRedirecting
              ? <><Loader2 size={12} className="animate-spin" /> Redirecting…</>
              : <><CreditCard size={12} /> Upgrade to {PLANS.find((p) => p.id === selectedPlan)?.name}</>
            }
          </button>
        )}

        {selectedPlan === currentPlan && currentPlan !== "free" && (
          <button
            onClick={handleManageBilling}
            className="w-full py-2.5 border border-border text-muted-foreground text-[11px] font-medium rounded-xl hover:bg-muted transition flex items-center justify-center gap-1.5"
          >
            <ExternalLink size={12} /> Manage Subscription
          </button>
        )}

        {/* Usage breakdown */}
        <div className="p-3 bg-muted/50 rounded-xl border border-border">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Usage</span>
          <div className="space-y-2 mt-2">
            {[
              {
                label: "Credits remaining",
                used: credits,
                limit: PLANS.find((p) => p.id === currentPlan)?.credits ?? 50,
                color: "bg-violet-400",
              },
            ].map((u) => (
              <div key={u.label}>
                <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
                  <span>{u.label}</span>
                  <span>{u.used.toLocaleString()} / {u.limit.toLocaleString()}</span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${u.color} rounded-full`}
                    style={{ width: `${Math.min((u.used / u.limit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Full billing link */}
        <button
          onClick={() => window.open("/dashboard/billing", "_blank")}
          className="w-full flex items-center justify-between p-3 bg-muted/50 border border-border rounded-xl hover:bg-muted transition"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-violet-400" />
            <div className="text-left">
              <span className="text-[11px] font-medium text-foreground block">Full billing dashboard</span>
              <span className="text-[9px] text-muted-foreground">Invoices, credit packs, team usage</span>
            </div>
          </div>
          <ArrowRight size={12} className="text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
