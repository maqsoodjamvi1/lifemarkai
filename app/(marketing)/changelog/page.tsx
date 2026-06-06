import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Changelog — LifemarkAI",
  description: "New features, improvements and fixes in LifemarkAI.",
};

const RELEASES = [
  {
    version: "2.8.0",
    date: "May 2026",
    tag: "major",
    title: "Playwright test runner + Resend domain verification",
    items: [
      { type: "new", text: "In-browser Playwright / Vitest test runner with live SSE log streaming" },
      { type: "new", text: "Resend domain verification — add your sending domain, get exact DNS records, re-check status in one click" },
      { type: "new", text: "DNS verification polling for custom project domains via Cloudflare DNS-over-HTTPS" },
    ],
  },
  {
    version: "2.7.0",
    date: "May 2026",
    tag: "major",
    title: "Gift cards, student discounts, and profile privacy",
    items: [
      { type: "new", text: "Discounts tab in billing: gift card / promo code redemption wired to Stripe" },
      { type: "new", text: "50% student discount for 3 months with .edu email verification" },
      { type: "new", text: "Privacy section in Settings — public/private profile toggle with live Supabase update" },
      { type: "new", text: "Public profiles now discoverable in the templates marketplace" },
    ],
  },
  {
    version: "2.6.0",
    date: "May 2026",
    tag: "major",
    title: "Semrush, Google Search Console, Telegram, ChatGPT connectors + Wiz SCA/SAST",
    items: [
      { type: "new", text: "4 new connectors: Semrush, Google Search Console, Telegram Bot, ChatGPT Actions" },
      { type: "new", text: "Vulnerability panel: full Wiz-style SCA (OSV.dev) and SAST (10 security rules) with Fix with AI per issue" },
      { type: "new", text: "Referral program: share your code, earn 25 credits per signup, referee gets 10" },
      { type: "new", text: "Database backup / restore panel with SQL archive download" },
    ],
  },
  {
    version: "2.5.0",
    date: "April 2026",
    tag: "major",
    title: "MCP server, branch checkpoints, PostHog & Amplitude MCPs",
    items: [
      { type: "new", text: "LifemarkAI MCP server — connect Claude Desktop or Cursor with a personal API token" },
      { type: "new", text: "Branch checkpoint explorer in history panel — filter by auto branch vs manual snapshots" },
      { type: "new", text: "PostHog MCP and Amplitude MCP added to the MCP marketplace" },
      { type: "new", text: "Amplitude, Linear, and Plaid added to connector wizard" },
    ],
  },
  {
    version: "2.4.0",
    date: "April 2026",
    tag: "major",
    title: "Draw-on-preview annotation, cross-project @mentions, real-time analytics",
    items: [
      { type: "new", text: "Annotate the live preview with pen, arrow, rectangle, eraser — send screenshot directly to AI" },
      { type: "new", text: "Cross-project @mentions in AI chat — pull in context from other projects" },
      { type: "new", text: "Per-project real-time analytics dashboard (views, visitors, countries, bounce rate)" },
      { type: "new", text: "Desktop notifications for long AI builds" },
    ],
  },
  {
    version: "2.3.0",
    date: "March 2026",
    tag: "major",
    title: "Agent mode, prompt queue, Mermaid diagrams",
    items: [
      { type: "new", text: "Agent clarifying questions before long builds — no more wasted credits" },
      { type: "new", text: "Prompt queue with drag-to-reorder, pause, and cancel" },
      { type: "new", text: "Mermaid diagram rendering in chat responses" },
      { type: "new", text: "Claude Opus 4.6 added to model selector as Best Quality tier" },
    ],
  },
  {
    version: "2.2.0",
    date: "March 2026",
    tag: "major",
    title: "GitHub push, presence indicators, file-to-app drop zone",
    items: [
      { type: "new", text: "GitHub push/export — push project files to a new or existing repo" },
      { type: "new", text: "Collaborator presence indicators in editor top bar" },
      { type: "new", text: "File-to-app drop zone — drag a zip, image, or PDF and AI converts it to a full app" },
      { type: "new", text: "Expiring shareable invite links for projects" },
    ],
  },
  {
    version: "2.1.0",
    date: "February 2026",
    tag: "major",
    title: "GitLab sync, auto top-up credits, auth connectors",
    items: [
      { type: "new", text: "GitLab repository sync and push" },
      { type: "new", text: "Auto top-up: automatically buy credits when balance falls below threshold" },
      { type: "new", text: "Auth connector wizard: Google, Apple, Auth0, NextAuth setup guides" },
      { type: "new", text: "Screenshot thumbnails automatically captured after each AI build" },
    ],
  },
  {
    version: "2.0.0",
    date: "January 2026",
    tag: "major",
    title: "LifemarkAI 2.0 — Full Lovable-grade editor",
    items: [
      { type: "new", text: "Complete editor rewrite: chat, plan, agent, git, collaboration, image gen panels" },
      { type: "new", text: "Live preview with console bridge, screenshot relay, and visual edit overlay" },
      { type: "new", text: "Supabase integration wizard with schema viewer and migration manager" },
      { type: "new", text: "Stripe billing: subscriptions, credit packs, auto top-up, Stripe Checkout" },
      { type: "new", text: "Teams, workspaces, SSO, SCIM provisioning" },
    ],
  },
];

const TAG_COLORS: Record<string, string> = {
  major:  "bg-violet-500/15 text-violet-400 border-violet-500/20",
  minor:  "bg-blue-500/15 text-blue-400 border-blue-500/20",
  patch:  "bg-zinc-700/40 text-zinc-400 border-zinc-600/30",
};

const ITEM_ICONS: Record<string, { icon: string; color: string }> = {
  new:    { icon: "✦", color: "text-emerald-400" },
  fix:    { icon: "⚡", color: "text-amber-400" },
  improvement: { icon: "↑", color: "text-blue-400" },
  breaking: { icon: "!", color: "text-red-400" },
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <div className="border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg tracking-tight">
            ⚡ LifemarkAI
          </Link>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="mb-14">
          <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 mb-4">
            What&apos;s new
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">Changelog</h1>
          <p className="text-zinc-400 text-lg">
            New features, improvements, and fixes — shipped continuously.
          </p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-0 w-px bg-white/[0.06]" />

          <div className="space-y-14">
            {RELEASES.map((release) => (
              <div key={release.version} className="relative pl-8">
                {/* Dot */}
                <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full bg-zinc-800 border-2 border-violet-500/60 ring-4 ring-zinc-950" />

                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="text-xl font-bold text-white">v{release.version}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TAG_COLORS[release.tag]}`}>
                    {release.tag}
                  </span>
                  <span className="text-sm text-zinc-500">{release.date}</span>
                </div>

                <h2 className="text-base font-semibold text-zinc-200 mb-4">{release.title}</h2>

                <ul className="space-y-2.5">
                  {release.items.map((item, i) => {
                    const meta = ITEM_ICONS[item.type] ?? ITEM_ICONS.new;
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <span className={`text-sm font-bold mt-0.5 shrink-0 w-4 text-center ${meta.color}`}>
                          {meta.icon}
                        </span>
                        <span className="text-sm text-zinc-300 leading-relaxed">{item.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mt-20 pt-10 border-t border-white/[0.06] text-center">
          <p className="text-zinc-500 text-sm mb-4">
            Want to suggest a feature or report a bug?
          </p>
          <a
            href="mailto:feedback@lifemarkai.com"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 transition-colors text-sm font-medium"
          >
            Send feedback
          </a>
        </div>
      </div>
    </div>
  );
}
