"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, CreditCard, Package, TrendingUp, Clock, CheckCircle,
  ArrowUpRight, ArrowDownLeft, Loader2, Star, Users, Send,
  BarChart3, ChevronDown, X, Gift, Sparkles,
  RefreshCw, ShieldCheck, ToggleLeft, ToggleRight, AlertCircle, Trash2,
  Check, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { PLANS, CREDIT_PACKS, CREDIT_COSTS, formatCredits } from "@/lib/stripe/plans";
import type { Profile, CreditLog } from "@/types/database";
import { WorkspaceCreditPool } from "@/components/dashboard/workspace-credit-pool";

interface TeamMini { id: string; name: string; credits: number; role: string }

interface BillingPageProps {
  profile: Profile | null;
  creditLogs: CreditLog[];
  teams: TeamMini[];
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  chat_message:      { label: "Chat",        color: "text-blue-400" },
  build_message:     { label: "Build",       color: "text-violet-400" },
  agent_run:         { label: "Agent",       color: "text-purple-400" },
  image_generation:  { label: "Image Gen",   color: "text-pink-400" },
  plan_message:      { label: "Plan",        color: "text-indigo-400" },
  fix:               { label: "Auto-Fix",    color: "text-amber-400" },
  credit_purchase:   { label: "Purchase",    color: "text-emerald-400" },
  credit_transfer:   { label: "Transfer",    color: "text-cyan-400" },
  subscription:      { label: "Subscription",color: "text-emerald-400" },
};

const TABS = ["overview", "plans", "packs", "transfer", "auto-topup", "history", "referral", "discounts"] as const;
type Tab = typeof TABS[number];

export function BillingPage({ profile, creditLogs, teams }: BillingPageProps) {
  const [tab, setTab]           = useState<Tab>("overview");
  const [referralData, setReferralData] = useState<{
    code: string | null; link: string | null; creditsEarned: number;
    referrals: Array<{ id: string; status: string; creditsGiven: number; createdAt: string }>;
    pendingCount: number; creditedCount: number;
  } | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [billing, setBilling]   = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading]   = useState<string | null>(null);
  const [packTeam, setPackTeam] = useState<string>("");
  // Transfer state
  const [transferTo, setTransferTo]     = useState<"user" | "team">("team");
  const [transferTeam, setTransferTeam] = useState(teams[0]?.id ?? "");
  const [transferEmail, setTransferEmail] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote]   = useState("");
  const { toast } = useToast();

  // ── Auto top-up state ──────────────────────────────────────────────────────
  // ── Discounts state ───────────────────────────────────────────────────────
  const [promoCode, setPromoCode]           = useState("");
  const [promoLoading, setPromoLoading]     = useState(false);
  const [promoResult, setPromoResult]       = useState<{ success: boolean; message: string } | null>(null);
  const [studentEmail, setStudentEmail]     = useState("");
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentResult, setStudentResult]   = useState<{ success: boolean; message: string } | null>(null);

  const [atEnabled, setAtEnabled]       = useState(false);
  const [atThreshold, setAtThreshold]   = useState(50);
  const [atAmount, setAtAmount]         = useState(200);
  const [atCard, setAtCard]             = useState<{ brand: string; last4: string; expMonth: number; expYear: number } | null>(null);
  const [atHasCard, setAtHasCard]       = useState(false);
  const [atLoading, setAtLoading]       = useState(false);
  const [atSettingsLoading, setAtSettingsLoading] = useState(false);
  const [atSaved, setAtSaved]           = useState(false);

  const loadAutoTopup = useCallback(async () => {
    setAtLoading(true);
    try {
      const res = await fetch("/api/billing/auto-topup");
      if (!res.ok) return;
      const data = await res.json();
      setAtEnabled(data.enabled ?? false);
      setAtThreshold(data.threshold ?? 50);
      setAtAmount(data.amount ?? 200);
      setAtHasCard(data.hasCard ?? false);
      setAtCard(data.card ?? null);
    } finally {
      setAtLoading(false);
    }
  }, []);

  async function redeemPromo() {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoResult(null);
    try {
      const res = await fetch("/api/billing/redeem-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok) {
        setPromoResult({ success: false, message: data.error ?? "Invalid promo code." });
      } else {
        setPromoResult({ success: true, message: data.message ?? "Promo code applied!" });
        setPromoCode("");
      }
    } finally {
      setPromoLoading(false);
    }
  }

  async function applyStudentDiscount() {
    if (!studentEmail.trim()) return;
    if (!studentEmail.toLowerCase().endsWith(".edu")) {
      setStudentResult({ success: false, message: "Please enter a valid .edu email address." });
      return;
    }
    setStudentLoading(true);
    setStudentResult(null);
    try {
      const res = await fetch("/api/billing/student-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eduEmail: studentEmail.trim() }),
      });
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok) {
        setStudentResult({ success: false, message: data.error ?? "Could not apply discount." });
      } else {
        setStudentResult({ success: true, message: data.message ?? "50% student discount applied for 3 months!" });
        setStudentEmail("");
      }
    } finally {
      setStudentLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "auto-topup") void loadAutoTopup();
    if (tab === "referral" && !referralData) {
      setReferralLoading(true);
      fetch("/api/referral").then(r => r.json()).then(d => setReferralData(d)).finally(() => setReferralLoading(false));
    }
  }, [tab, loadAutoTopup, referralData]);

  async function saveAutoTopupSettings() {
    setAtSettingsLoading(true);
    try {
      await fetch("/api/billing/auto-topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: atEnabled, threshold: atThreshold, amount: atAmount }),
      });
      setAtSaved(true);
      setTimeout(() => setAtSaved(false), 2000);
      toast({ title: "Auto top-up saved", description: "Your settings have been updated." });
    } finally {
      setAtSettingsLoading(false);
    }
  }

  async function removeCard() {
    await fetch("/api/billing/auto-topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove-card" }),
    });
    setAtHasCard(false);
    setAtCard(null);
    setAtEnabled(false);
    toast({ title: "Card removed", description: "Auto top-up has been disabled." });
  }

  const plan       = profile?.plan ?? "free";
  const credits    = profile?.credits ?? 0;
  const currentPlan = PLANS.find((p) => p.id === plan) ?? PLANS[0];

  // Usage breakdown from logs
  const usageByAction = useMemo(() => {
    const map: Record<string, number> = {};
    for (const log of creditLogs) {
      if (log.amount < 0) {
        map[log.action] = (map[log.action] ?? 0) + Math.abs(log.amount);
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [creditLogs]);

  const totalUsed = useMemo(() => creditLogs.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0), [creditLogs]);
  const totalEarned = useMemo(() => creditLogs.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0), [creditLogs]);

  async function handleUpgrade(planId: string) {
    if (planId === plan || planId === "free" || planId === "enterprise") return;
    setLoading(`plan-${planId}`);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, billing }),
      });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
      else throw new Error("No checkout URL");
    } catch {
      toast({ title: "Failed to start checkout", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  async function buyPack(packKey: string) {
    setLoading(`pack-${packKey}`);
    try {
      const res = await fetch("/api/billing/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packKey, teamId: packTeam || null }),
      });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
      else throw new Error("No checkout URL");
    } catch {
      toast({ title: "Failed to start purchase", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  async function openPortal() {
    setLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch {
      toast({ title: "Failed to open billing portal", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  async function handleTransfer() {
    const amount = parseInt(transferAmount);
    if (!amount || amount <= 0) return toast({ title: "Enter a valid amount", variant: "destructive" });
    if (transferTo === "team" && !transferTeam) return toast({ title: "Select a team", variant: "destructive" });
    if (transferTo === "user" && !transferEmail) return toast({ title: "Enter recipient email", variant: "destructive" });

    setLoading("transfer");
    try {
      const res = await fetch("/api/teams/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toTeamId:  transferTo === "team" ? transferTeam : undefined,
          toUserId:  transferTo === "user" ? undefined : undefined,  // email lookup needed
          amount,
          note: transferNote || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error);
      }
      toast({ title: `✅ ${amount} credits transferred successfully!` });
      setTransferAmount(""); setTransferNote("");
      window.location.reload();
    } catch (e: unknown) {
      toast({ title: (e as Error).message || "Transfer failed", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-[#0a0a0f]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Billing & Credits</h1>
          <p className="text-slate-400">Manage your plan, buy credits, and share with your team.</p>
        </div>

        {/* Hero stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Your Balance",
              value: credits === 99999 ? "∞" : credits.toLocaleString(),
              sub: "personal credits",
              icon: Zap,
              color: "from-violet-600/20 to-indigo-600/10 border-violet-500/20",
              iconColor: "text-violet-400",
            },
            {
              label: "Current Plan",
              value: currentPlan.name,
              sub: `${formatCredits(currentPlan.credits)}/mo included`,
              icon: Star,
              color: "from-indigo-600/20 to-blue-600/10 border-indigo-500/20",
              iconColor: "text-indigo-400",
            },
            {
              label: "Credits Used",
              value: totalUsed.toLocaleString(),
              sub: "this period",
              icon: TrendingUp,
              color: "from-rose-600/20 to-pink-600/10 border-rose-500/20",
              iconColor: "text-rose-400",
            },
            {
              label: "Teams",
              value: teams.length,
              sub: teams.length === 1 ? "workspace" : "workspaces",
              icon: Users,
              color: "from-emerald-600/20 to-teal-600/10 border-emerald-500/20",
              iconColor: "text-emerald-400",
            },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`p-5 rounded-2xl bg-gradient-to-br border ${s.color}`}
            >
              <div className="flex items-center gap-2 mb-3">
                <s.icon className={`w-4 h-4 ${s.iconColor}`} />
                <span className="text-xs text-slate-400">{s.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Team pools — full workspace credit pool UI */}
        {teams.length > 0 && (
          <div className="mb-8 space-y-4">
            {teams.map((team) => (
              <WorkspaceCreditPool
                key={team.id}
                teamId={team.id}
                isAdmin={team.role === "owner" || team.role === "admin"}
              />
            ))}

          </div>
        )}

        {/* Tab navigation */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] mb-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 min-w-max py-2 px-4 rounded-lg text-sm font-medium capitalize transition-all ${
                tab === t
                  ? "bg-white/[0.08] text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t === "packs" ? "Buy Credits" : t === "transfer" ? "Transfer" : t === "auto-topup" ? "Auto Top-Up" : t === "referral" ? "Refer & Earn" : t === "discounts" ? "Discounts" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              {/* Credit bar */}
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-slate-300 font-medium">Credit Usage This Period</span>
                  <span className="text-sm text-slate-400">{totalUsed} used / {totalEarned} earned</span>
                </div>
                <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, totalEarned > 0 ? (totalUsed / totalEarned) * 100 : 0)}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full"
                  />
                </div>
              </div>

              {/* Usage by action */}
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-violet-400" /> Usage Breakdown
                </h3>
                {usageByAction.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">No usage yet this period.</p>
                ) : (
                  <div className="space-y-3">
                    {usageByAction.map(([action, used]) => {
                      const info = ACTION_LABELS[action] ?? { label: action, color: "text-slate-400" };
                      const pct = totalUsed > 0 ? (used / totalUsed) * 100 : 0;
                      return (
                        <div key={action}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-medium ${info.color}`}>{info.label}</span>
                            <span className="text-xs text-slate-400">{used} credits ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6 }}
                              className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Credit cost reference */}
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" /> Credit Costs
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(CREDIT_COSTS).map(([action, cost]) => (
                    <div key={action} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <span className="text-xs text-slate-300 capitalize">{action}</span>
                      <span className="text-xs font-bold text-violet-400">{cost}cr</span>
                    </div>
                  ))}
                </div>
              </div>

              {plan !== "free" && (
                <Button variant="outline" size="sm" onClick={openPortal} disabled={loading === "portal"}
                  className="border-white/10 text-slate-300 hover:text-white">
                  {loading === "portal" ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <CreditCard className="w-3.5 h-3.5 mr-2" />}
                  Manage Billing & Invoices
                </Button>
              )}
            </motion.div>
          )}

          {/* ── PLANS ── */}
          {tab === "plans" && (
            <motion.div key="plans" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              {/* Billing toggle */}
              <div className="flex justify-center">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  {(["monthly", "yearly"] as const).map((b) => (
                    <button
                      key={b}
                      onClick={() => setBilling(b)}
                      className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                        billing === b ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {b.charAt(0).toUpperCase() + b.slice(1)}
                      {b === "yearly" && (
                        <span className="ml-2 text-xs text-emerald-400 font-semibold">Save 20%</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {PLANS.map((p, i) => {
                  const isCurrent = plan === p.id;
                  const price = billing === "yearly" ? p.yearlyPrice : p.monthlyPrice;
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07 }}
                      className={`relative flex flex-col p-5 rounded-2xl border bg-white/[0.03] ${p.color} ${
                        p.highlighted ? "shadow-lg shadow-violet-500/10" : ""
                      }`}
                    >
                      {p.badge && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-0.5 rounded-full bg-violet-600 text-white whitespace-nowrap">
                          {p.badge}
                        </span>
                      )}
                      <div className="mb-4">
                        <p className="text-xs text-slate-400 mb-1">{p.tagline}</p>
                        <p className="text-lg font-bold text-white">{p.name}</p>
                        <div className="mt-2">
                          {price === -1 ? (
                            <p className="text-2xl font-bold text-white">Custom</p>
                          ) : price === 0 ? (
                            <p className="text-2xl font-bold text-white">Free</p>
                          ) : (
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-bold text-white">${(price / 100).toFixed(0)}</span>
                              <span className="text-sm text-slate-400">/mo{billing === "yearly" ? ", billed yearly" : ""}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-violet-300 mt-1 font-medium">
                          {formatCredits(p.credits)} credits/month
                        </p>
                      </div>

                      <ul className="space-y-2 mb-5 flex-1">
                        {p.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      {isCurrent ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> Current plan
                        </div>
                      ) : p.id === "enterprise" ? (
                        <a href="mailto:hello@lifemarkai.com"
                          className="flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl border border-amber-500/30 text-amber-400 text-sm font-medium hover:bg-amber-500/10 transition-all">
                          Contact us
                        </a>
                      ) : p.id === "free" ? null : (
                        <button
                          onClick={() => handleUpgrade(p.id)}
                          disabled={!!loading}
                          className={`w-full py-2 px-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                            p.highlighted
                              ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 shadow-lg shadow-violet-500/25"
                              : "border border-white/10 text-white hover:bg-white/[0.06]"
                          }`}
                        >
                          {loading === `plan-${p.id}` ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              Upgrade to {p.name}
                            </>
                          )}
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── BUY CREDITS (packs) ── */}
          {tab === "packs" && (
            <motion.div key="packs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-start gap-3">
                <Gift className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white">One-time credit packs</p>
                  <p className="text-xs text-slate-400 mt-0.5">Credits never expire. Buy for yourself or top up your team&apos;s shared pool.</p>
                </div>
              </div>

              {/* Deposit to team selector */}
              {teams.length > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400 whitespace-nowrap">Credits for:</span>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setPackTeam("")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        packTeam === "" ? "bg-violet-500/20 border-violet-500/40 text-violet-300" : "border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      My Account
                    </button>
                    {teams.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setPackTeam(t.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          packTeam === t.id ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300" : "border-white/10 text-slate-400 hover:text-white"
                        }`}
                      >
                        {t.name} (pool)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {CREDIT_PACKS.map((pack, i) => (
                  <motion.div
                    key={pack.key}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="relative group p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] transition-all"
                  >
                    {pack.badge && (
                      <span className="absolute -top-2.5 left-4 text-xs font-bold px-2.5 py-0.5 rounded-full bg-violet-600 text-white">
                        {pack.badge}
                      </span>
                    )}
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-violet-400" />
                        </div>
                        {pack.savingPct && (
                          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            Save {pack.savingPct}%
                          </span>
                        )}
                      </div>
                      <p className="text-xl font-bold text-white">{pack.credits.toLocaleString()} credits</p>
                      <p className="text-xs text-slate-400 mb-1">{pack.label}</p>
                      <p className="text-xs text-slate-500 mb-4">{pack.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-white">${(pack.priceCents / 100).toFixed(0)}</span>
                        <button
                          onClick={() => buyPack(pack.key)}
                          disabled={!!loading}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-violet-500/25"
                        >
                          {loading === `pack-${pack.key}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>Buy <ArrowUpRight className="w-3.5 h-3.5" /></>
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        {((pack.priceCents / pack.credits)).toFixed(1)}¢ per credit
                        {pack.savingPct ? ` · ${pack.savingPct}% off base rate` : ""}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── TRANSFER ── */}
          {tab === "transfer" && (
            <motion.div key="transfer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-md space-y-5">
              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-start gap-3">
                <Send className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white">Transfer Credits</p>
                  <p className="text-xs text-slate-400 mt-0.5">Send credits to a teammate or top up a team&apos;s shared pool.</p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-4">
                <div className="flex gap-2">
                  {(["team", "user"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTransferTo(t)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                        transferTo === t
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                          : "border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      {t === "team" ? "Team Pool" : "Teammate"}
                    </button>
                  ))}
                </div>

                {transferTo === "team" ? (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Select team</label>
                    {teams.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">You&apos;re not in any teams yet.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {teams.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setTransferTeam(t.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                              transferTeam === t.id
                                ? "border-violet-500/40 bg-violet-500/10"
                                : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                            }`}
                          >
                            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-indigo-400">{t.name[0]}</span>
                            </div>
                            <div className="text-left">
                              <p className="text-sm text-white">{t.name}</p>
                              <p className="text-xs text-slate-400">{t.credits} pool credits</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Recipient email</label>
                    <Input
                      type="email"
                      placeholder="teammate@company.com"
                      value={transferEmail}
                      onChange={(e) => setTransferEmail(e.target.value)}
                      className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-500 focus:border-violet-500/50"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Amount (credits)</label>
                  <Input
                    type="number"
                    placeholder="e.g. 100"
                    min={1}
                    max={credits}
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-500 focus:border-violet-500/50"
                  />
                  <p className="text-xs text-slate-500">Your balance: {credits} credits</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Note (optional)</label>
                  <Input
                    placeholder="e.g. Monthly team top-up"
                    value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-500 focus:border-violet-500/50"
                  />
                </div>

                <button
                  onClick={handleTransfer}
                  disabled={!!loading || !transferAmount}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25"
                >
                  {loading === "transfer" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <><Send className="w-4 h-4" /> Send Credits</>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── AUTO TOP-UP ── */}
          {tab === "auto-topup" && (
            <motion.div key="auto-topup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-lg space-y-5">
              {atLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                </div>
              ) : (
                <>
                  {/* Explainer */}
                  <div className="rounded-xl bg-violet-500/5 border border-violet-500/20 px-4 py-3 flex items-start gap-3">
                    <RefreshCw className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-violet-300">Never run out of credits</p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                        When your balance drops below your threshold, LifemarkAI automatically purchases credits
                        using your saved card — no interruption to your workflow.
                      </p>
                    </div>
                  </div>

                  {/* Saved card */}
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-4 space-y-3">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Payment card</p>
                    {atHasCard && atCard ? (
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-6 rounded bg-slate-700 flex items-center justify-center text-[10px] font-bold uppercase text-slate-300">
                          {atCard.brand.slice(0, 4)}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">•••• •••• •••• {atCard.last4}</p>
                          <p className="text-xs text-slate-500">Expires {atCard.expMonth}/{atCard.expYear}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-xs text-emerald-400">Saved</span>
                        </div>
                        <button
                          onClick={() => void removeCard()}
                          className="ml-2 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Remove card"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500">No card saved. Add one to enable auto top-up.</p>
                        <p className="text-[11px] text-slate-600 flex items-start gap-1.5">
                          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 text-amber-500/70" />
                          To save a card, complete a purchase from the <button onClick={() => setTab("packs")} className="underline text-violet-400 hover:text-violet-300">Buy Credits</button> tab — your payment method will be stored for auto top-up.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Settings */}
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-4 space-y-4">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Settings</p>

                    {/* Enable toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Enable auto top-up</p>
                        <p className="text-xs text-slate-500 mt-0.5">Automatically recharge when balance is low</p>
                      </div>
                      <button
                        onClick={() => setAtEnabled((v) => !v)}
                        disabled={!atHasCard}
                        className={`transition-colors ${!atHasCard ? "opacity-40 cursor-not-allowed" : ""}`}
                        title={!atHasCard ? "Add a card first" : undefined}
                      >
                        {atEnabled
                          ? <ToggleRight className="w-8 h-8 text-violet-400" />
                          : <ToggleLeft className="w-8 h-8 text-slate-500" />
                        }
                      </button>
                    </div>

                    {/* Threshold */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400">Top up when balance falls below</label>
                      <div className="flex gap-2 flex-wrap">
                        {[25, 50, 100, 200].map((n) => (
                          <button
                            key={n}
                            onClick={() => setAtThreshold(n)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                              atThreshold === n
                                ? "border-violet-500/60 bg-violet-500/15 text-violet-300"
                                : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300"
                            }`}
                          >
                            {n} credits
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Top-up amount */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400">Add this many credits</label>
                      <div className="flex gap-2 flex-wrap">
                        {CREDIT_PACKS.map((pack) => (
                          <button
                            key={pack.key}
                            onClick={() => setAtAmount(pack.credits)}
                            className={`flex flex-col items-start px-3 py-2 rounded-lg text-xs border transition-all ${
                              atAmount === pack.credits
                                ? "border-violet-500/60 bg-violet-500/15 text-violet-300"
                                : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300"
                            }`}
                          >
                            <span className="font-semibold">{pack.credits} credits</span>
                            <span className="text-[10px] opacity-70">${(pack.priceCents / 100).toFixed(0)}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Summary */}
                    {atEnabled && (
                      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400">
                        ✓ When your balance drops below <strong>{atThreshold}</strong> credits, we'll automatically add <strong>{atAmount}</strong> credits (${(CREDIT_PACKS.find(p => p.credits === atAmount)?.priceCents ?? 0) / 100}) to your account.
                      </div>
                    )}

                    <Button
                      onClick={() => void saveAutoTopupSettings()}
                      disabled={atSettingsLoading}
                      className="w-full gap-2 bg-violet-600 hover:bg-violet-500 text-white"
                    >
                      {atSettingsLoading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : atSaved
                        ? <CheckCircle className="w-4 h-4 text-emerald-300" />
                        : <RefreshCw className="w-4 h-4" />
                      }
                      {atSaved ? "Saved!" : "Save settings"}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── HISTORY ── */}
          {tab === "history" && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                {creditLogs.length === 0 ? (
                  <div className="text-center py-16">
                    <Clock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400">No credit activity yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {creditLogs.map((log) => {
                      const info = ACTION_LABELS[log.action] ?? { label: log.action, color: "text-slate-400" };
                      const isPositive = log.amount > 0;
                      return (
                        <div key={log.id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            isPositive ? "bg-emerald-500/10" : "bg-red-500/10"
                          }`}>
                            {isPositive
                              ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                              : <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${info.color}`}>{info.label}</p>
                            {log.description && (
                              <p className="text-xs text-slate-500 truncate">{log.description}</p>
                            )}
                          </div>
                          <div className={`text-sm font-bold tabular-nums ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                            {isPositive ? "+" : ""}{log.amount}
                          </div>
                          <div className="text-xs text-slate-500 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {tab === "referral" && (
            <motion.div key="referral" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-lg space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Refer & Earn</h2>
                <p className="text-sm text-slate-400">
                  Share your referral link. You earn <span className="text-violet-400 font-medium">25 credits</span> for each friend who signs up, and they get <span className="text-emerald-400 font-medium">10 credits</span> to start.
                </p>
              </div>

              {referralLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading your referral details…
                </div>
              ) : referralData ? (
                <>
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Credits Earned", value: referralData.creditsEarned, color: "text-violet-400" },
                      { label: "Signups", value: referralData.creditedCount, color: "text-emerald-400" },
                      { label: "Pending", value: referralData.pendingCount, color: "text-amber-400" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                        <p className={`text-2xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-slate-500 mt-1">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Referral link */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                    <p className="text-sm font-medium text-white">Your referral link</p>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={referralData.link ?? ""}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 font-mono truncate"
                      />
                      <button
                        onClick={() => {
                          if (referralData.link) {
                            navigator.clipboard.writeText(referralData.link);
                            setReferralCopied(true);
                            setTimeout(() => setReferralCopied(false), 2000);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors flex-shrink-0"
                      >
                        {referralCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {referralCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* Recent referrals */}
                  {referralData.referrals.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-white">Recent referrals</p>
                      <div className="space-y-1">
                        {referralData.referrals.slice(0, 5).map((r) => (
                          <div key={r.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-white/[0.03] border border-white/10">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              r.status === "credited" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                            }`}>{r.status}</span>
                            <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                            {r.creditsGiven > 0 && <span className="text-xs text-violet-400">+{r.creditsGiven} cr</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center space-y-3">
                  <Users className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm text-slate-400">Share your referral link to earn credits.</p>
                  <Button onClick={() => { void (async () => { setReferralLoading(true); const r = await fetch("/api/referral"); const d = await r.json(); setReferralData(d); setReferralLoading(false); })(); }} variant="outline" size="sm">Generate referral link</Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
