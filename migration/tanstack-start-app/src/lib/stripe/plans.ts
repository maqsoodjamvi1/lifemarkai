export type PlanId = "free" | "pro" | "team" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyPrice: number;    // USD cents
  yearlyPrice: number;     // USD cents (per month, billed annually)
  credits: number;         // credits per month
  maxProjects: number | null;
  maxTeamMembers: number;
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  color: string;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Try it out",
    monthlyPrice: 0,
    yearlyPrice: 0,
    credits: 50,
    maxProjects: 3,
    maxTeamMembers: 1,
    stripePriceIdMonthly: "",
    stripePriceIdYearly: "",
    color: "border-white/10",
    features: [
      "50 credits / month",
      "3 projects",
      "Community preview",
      "Basic AI (Chat mode)",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For individual builders",
    monthlyPrice: 2000,
    yearlyPrice: 1600,
    credits: 500,
    maxProjects: null,
    maxTeamMembers: 1,
    stripePriceIdMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? "",
    stripePriceIdYearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID ?? "",
    highlighted: true,
    badge: "Most Popular",
    color: "border-violet-500/50",
    features: [
      "500 credits / month",
      "Unlimited projects",
      "All AI modes (Build, Agent, Plan)",
      "GitHub sync",
      "Custom domains",
      "Version history",
      "Priority support",
    ],
  },
  {
    id: "team",
    name: "Team",
    tagline: "Collaborate with your crew",
    monthlyPrice: 6000,
    yearlyPrice: 4800,
    credits: 2000,
    maxProjects: null,
    maxTeamMembers: 10,
    stripePriceIdMonthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID ?? "",
    stripePriceIdYearly: process.env.STRIPE_TEAM_YEARLY_PRICE_ID ?? "",
    color: "border-indigo-500/50",
    features: [
      "2 000 shared credits / month",
      "Up to 10 team members",
      "Shared credit pool",
      "Per-member credit allowances",
      "Live collaboration",
      "Team analytics",
      "Everything in Pro",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For large organisations",
    monthlyPrice: -1,   // custom
    yearlyPrice: -1,
    credits: -1,        // unlimited
    maxProjects: null,
    maxTeamMembers: -1, // unlimited
    stripePriceIdMonthly: "",
    stripePriceIdYearly: "",
    color: "border-amber-500/50",
    features: [
      "Unlimited credits",
      "Unlimited team members",
      "SSO / SAML",
      "SLA + dedicated support",
      "Custom AI model fine-tuning",
      "On-premise option",
    ],
  },
];

export interface CreditPack {
  key: string;
  credits: number;
  priceCents: number;     // USD cents
  label: string;
  description: string;
  savingPct?: number;
  badge?: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    key: "50",
    credits: 50,
    priceCents: 500,       // $5
    label: "Starter Pack",
    description: "50 credits — perfect for a quick project",
  },
  {
    key: "200",
    credits: 200,
    priceCents: 1800,      // $18 (save 10%)
    label: "Builder Pack",
    description: "200 credits — great value for regular builders",
    savingPct: 10,
  },
  {
    key: "500",
    credits: 500,
    priceCents: 4000,      // $40 (save 20%)
    label: "Power Pack",
    description: "500 credits — serious building power",
    savingPct: 20,
    badge: "Best Value",
  },
  {
    key: "1000",
    credits: 1000,
    priceCents: 7000,      // $70 (save 30%)
    label: "Pro Pack",
    description: "1 000 credits — for power users and teams",
    savingPct: 30,
  },
  {
    key: "5000",
    credits: 5000,
    priceCents: 30000,     // $300 (save 40%)
    label: "Enterprise Pack",
    description: "5 000 credits — bulk purchase for organisations",
    savingPct: 40,
    badge: "Bulk",
  },
];

export const CREDIT_COSTS = {
  chat:   1,
  plan:   1,
  build:  2,
  agent:  2,
  image:  3,
  fix:    1,
} as const;

export function getPlan(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function getPlanByPriceId(priceId: string): Plan | undefined {
  return PLANS.find(
    (p) => p.stripePriceIdMonthly === priceId || p.stripePriceIdYearly === priceId
  );
}

export function getPack(key: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.key === key);
}

export function formatCredits(n: number): string {
  if (n === -1) return "Unlimited";
  return n.toLocaleString();
}
