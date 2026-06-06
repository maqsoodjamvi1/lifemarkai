"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Zap, Users, Building2, Sparkles, Star } from "lucide-react";

// Mirrors lib/stripe/plans.ts PLANS array
const PLANS = [
  {
    key: "free",
    name: "Free",
    icon: Zap,
    monthlyPrice: 0,
    yearlyPrice: 0,
    credits: 50,
    description: "Try LifemarkAI with no commitment",
    badge: null,
    color: "border-white/[0.08]",
    glow: "",
    ctaLabel: "Start for free",
    ctaStyle: "border border-white/10 text-white hover:bg-white/[0.04]",
    features: [
      "50 AI credits / month",
      "3 projects",
      "Deploy to .lifemarkai.app",
      "Basic templates",
      "React + Tailwind output",
      "Community support",
    ],
    missing: ["Private projects", "Custom domains", "GitHub sync", "Team collaboration", "Agent Mode"],
  },
  {
    key: "pro",
    name: "Pro",
    icon: Star,
    monthlyPrice: 25,
    yearlyPrice: 20,
    credits: 500,
    description: "Everything you need to ship production apps",
    badge: "Most Popular",
    color: "border-violet-500/50",
    glow: "shadow-[0_0_40px_rgba(124,58,237,0.15)]",
    ctaLabel: "Start Pro",
    ctaStyle: "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90",
    features: [
      "500 AI credits / month",
      "Unlimited private projects",
      "1 custom domain",
      "GitHub two-way sync",
      "GPT-4o + Claude Sonnet",
      "Agent Mode + Visual Edit",
      "Image generation (DALL-E 3)",
      "Monaco code editor",
      "Priority support",
      "Deploy to Vercel / Netlify",
    ],
    missing: ["Team collaboration", "SSO", "Audit logs"],
  },
  {
    key: "team",
    name: "Team",
    icon: Users,
    monthlyPrice: 50,
    yearlyPrice: 40,
    credits: 2000,
    description: "Shared credit pool and real-time collaboration",
    badge: "Teams",
    color: "border-blue-500/40",
    glow: "shadow-[0_0_40px_rgba(59,130,246,0.12)]",
    ctaLabel: "Start Team Plan",
    ctaStyle: "bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:opacity-90",
    features: [
      "2,000 shared credits / month",
      "Up to 20 team members",
      "Per-member credit allowances",
      "Credit transfers between members",
      "Shared project workspace",
      "5 custom domains",
      "Real-time collaboration",
      "All Pro features included",
      "Team analytics dashboard",
      "Priority AI queue",
    ],
    missing: ["SAML SSO", "Audit logs", "Data residency"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    icon: Building2,
    monthlyPrice: null,
    yearlyPrice: null,
    credits: null,
    description: "Custom contracts, SLAs, and dedicated infrastructure",
    badge: "Custom",
    color: "border-amber-500/30",
    glow: "",
    ctaLabel: "Contact sales",
    ctaStyle: "border border-amber-500/40 text-amber-400 hover:bg-amber-500/10",
    features: [
      "Unlimited credits",
      "Unlimited team members",
      "SAML / OIDC SSO",
      "Audit logging",
      "Data residency options",
      "IP allowlisting",
      "Dedicated AI infrastructure",
      "Custom integrations",
      "SLA guarantees",
      "Dedicated customer success",
    ],
    missing: [],
  },
];

const CREDIT_PACKS = [
  { credits: 50,   priceCents: 500,   label: "Starter Pack" },
  { credits: 200,  priceCents: 1600,  label: "Builder Pack",  savingPct: 20 },
  { credits: 500,  priceCents: 3500,  label: "Pro Pack",      savingPct: 30, badge: "Popular" },
  { credits: 1000, priceCents: 6000,  label: "Studio Pack",   savingPct: 40 },
  { credits: 5000, priceCents: 25000, label: "Agency Pack",   savingPct: 50, badge: "Best Value" },
];

export function PricingSection() {
  const router = useRouter();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handlePlanClick(planKey: string) {
    if (planKey === "free") { router.push("/signup"); return; }
    if (planKey === "enterprise") { router.push("mailto:sales@lifemarkai.com"); return; }
    setLoadingPlan(planKey);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey, billing }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoadingPlan(null);
    }
  }

  async function handlePackClick(credits: number) {
    const res = await fetch("/api/billing/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else router.push("/login?next=/dashboard/billing");
  }

  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-400 text-sm font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Simple, transparent pricing
          </div>
          <h1 className="text-5xl font-bold text-white tracking-tight mb-4">
            Pay for what you build
          </h1>
          <p className="text-slate-400 text-xl max-w-2xl mx-auto">
            Start free. Scale with credits. Share with your team.
            Every plan includes real AI-powered code generation.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 mt-8 p-1 rounded-xl bg-white/[0.05] border border-white/[0.08]">
            {(["monthly", "yearly"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBilling(b)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  billing === b
                    ? "bg-violet-600 text-white shadow-lg"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {b === "monthly" ? "Monthly" : "Yearly"}
                {b === "yearly" && (
                  <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                    Save 20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-24">
          {PLANS.map((plan, i) => {
            const Icon = plan.icon;
            const price = billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className={`relative flex flex-col rounded-2xl border bg-[#0f0f1a] p-6 ${plan.color} ${plan.glow}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 text-white whitespace-nowrap">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Icon + Name */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                    <Icon className="w-5 h-5 text-slate-300" />
                  </div>
                  <div>
                    <div className="font-bold text-white">{plan.name}</div>
                    <div className="text-xs text-slate-500">{plan.description}</div>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-6">
                  {price === null ? (
                    <div className="text-3xl font-bold text-white">Custom</div>
                  ) : (
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-bold text-white">${price}</span>
                      <span className="text-slate-500 mb-1">/mo</span>
                    </div>
                  )}
                  {plan.credits !== null && (
                    <div className="text-sm text-slate-400 mt-1">
                      <span className="text-violet-400 font-semibold">{plan.credits.toLocaleString()} credits</span> / month
                    </div>
                  )}
                  {plan.credits === null && (
                    <div className="text-sm text-amber-400 mt-1 font-semibold">Unlimited credits</div>
                  )}
                </div>

                {/* CTA */}
                <button
                  onClick={() => handlePlanClick(plan.key)}
                  disabled={loadingPlan === plan.key}
                  className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all mb-6 ${plan.ctaStyle} disabled:opacity-60`}
                >
                  {loadingPlan === plan.key ? "Redirecting…" : plan.ctaLabel}
                </button>

                {/* Features */}
                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                  {plan.missing.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                      <X className="w-4 h-4 text-slate-700 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        {/* Credit Packs */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-16"
        >
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-3">Top up anytime</h2>
            <p className="text-slate-400">
              Need more credits mid-month? Buy a one-time credit pack. They never expire.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {CREDIT_PACKS.map((pack, i) => {
              const centsPerCredit = pack.priceCents / pack.credits;
              return (
                <motion.button
                  key={pack.credits}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35 + i * 0.06 }}
                  onClick={() => handlePackClick(pack.credits)}
                  className="relative flex flex-col items-center p-5 rounded-2xl border border-white/[0.08] bg-[#0f0f1a] hover:border-violet-500/40 hover:bg-violet-500/5 transition-all group text-center"
                >
                  {pack.badge && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 text-white whitespace-nowrap">
                        {pack.badge}
                      </span>
                    </div>
                  )}
                  <div className="text-2xl font-bold text-white mb-1">
                    {pack.credits >= 1000 ? `${pack.credits / 1000}k` : pack.credits}
                  </div>
                  <div className="text-xs text-slate-400 mb-3">credits</div>
                  <div className="text-lg font-semibold text-violet-400 mb-1">
                    ${(pack.priceCents / 100).toFixed(0)}
                  </div>
                  <div className="text-[10px] text-slate-600">
                    ${centsPerCredit.toFixed(2)}/credit
                  </div>
                  {pack.savingPct && (
                    <div className="mt-2 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                      Save {pack.savingPct}%
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* FAQ / comparison note */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-2xl border border-white/[0.06] bg-[#0f0f1a] p-8"
        >
          <h3 className="text-xl font-bold text-white mb-6 text-center">What counts as a credit?</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { action: "Chat message", cost: 1, icon: "💬" },
              { action: "Build (full gen)", cost: 2, icon: "🏗️" },
              { action: "Agent step", cost: 2, icon: "🤖" },
              { action: "Image generation", cost: 3, icon: "🎨" },
            ].map(({ action, cost, icon }) => (
              <div key={action} className="text-center p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <div className="text-3xl mb-2">{icon}</div>
                <div className="text-sm text-slate-300 font-medium mb-1">{action}</div>
                <div className="text-violet-400 font-bold">{cost} credit{cost > 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-slate-500 text-sm mt-6">
            Credits are shared across all your projects. Team plan credits are pooled across all members.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
