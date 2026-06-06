"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, X, ChevronRight, Zap, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ─── Catalogue (mirrors app-connectors-panel but enriched for marketing) ──────

interface MarketingConnector {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  category: string;
  badge?: string;        // "New" | "Popular" | "Beta"
  useCases: string[];
  docsUrl: string;
}

const CONNECTORS: MarketingConnector[] = [
  // Communication
  { id: "slack",    name: "Slack",           emoji: "💬", tagline: "Team messaging & alerts",       category: "Communication", badge: "Popular",  useCases: ["Send build alerts", "Post AI responses", "Notify on deploys"],                  docsUrl: "https://api.slack.com/", description: "Send messages, read channels, and post real-time updates from your app to any Slack workspace." },
  { id: "resend",   name: "Resend",           emoji: "📧", tagline: "Transactional email",            category: "Communication", badge: "Popular",  useCases: ["Welcome emails", "Magic link auth", "Billing receipts"],                       docsUrl: "https://resend.com/docs", description: "Send beautiful transactional and marketing emails with deliverability built in." },
  { id: "twilio",   name: "Twilio",           emoji: "📱", tagline: "SMS, MMS & voice calls",        category: "Communication",                     useCases: ["SMS verification", "Appointment reminders", "Two-factor auth"],               docsUrl: "https://www.twilio.com/docs", description: "Add SMS, MMS, and voice calling to your app with Twilio's cloud communications platform." },
  { id: "telegram", name: "Telegram",         emoji: "✈️", tagline: "Bot messages & commands",       category: "Communication",                     useCases: ["Bot notifications", "Command handling", "Channel posts"],                     docsUrl: "https://core.telegram.org/bots/api", description: "Build Telegram bots that send messages, handle commands, and interact with users." },
  { id: "mailgun",  name: "Mailgun",          emoji: "🔫", tagline: "Email with tracking",           category: "Communication",                     useCases: ["Bulk email", "Bounce tracking", "Suppression management"],                    docsUrl: "https://documentation.mailgun.com/", description: "Send transactional email at scale with powerful deliverability analytics." },
  // Data
  { id: "airtable", name: "Airtable",         emoji: "🟡", tagline: "Flexible database & CRM",       category: "Data",          badge: "Popular",  useCases: ["CRM backend", "Content management", "Form submissions"],                      docsUrl: "https://airtable.com/developers/web/api/introduction", description: "Read and write Airtable bases as a flexible relational database for your app." },
  { id: "notion",   name: "Notion",           emoji: "⬛", tagline: "Docs, pages & databases",       category: "Data",          badge: "Popular",  useCases: ["CMS", "Knowledge base", "Task tracking"],                                    docsUrl: "https://developers.notion.com/", description: "Use Notion as a headless CMS or database — read pages, query databases, and write content." },
  { id: "snowflake",name: "Snowflake",        emoji: "❄️", tagline: "Cloud data warehouse",          category: "Data",                              useCases: ["Analytics queries", "Data exports", "BI dashboards"],                        docsUrl: "https://docs.snowflake.com/", description: "Run SQL queries against your Snowflake data warehouse directly from your app." },
  { id: "bigquery", name: "BigQuery",         emoji: "📊", tagline: "Google analytics at scale",     category: "Data",                              useCases: ["Event analytics", "User segmentation", "Revenue reporting"],                  docsUrl: "https://cloud.google.com/bigquery/docs", description: "Query Google BigQuery datasets and build real-time analytics dashboards." },
  { id: "aws_s3",   name: "AWS S3",           emoji: "🪣", tagline: "File storage & CDN",            category: "Data",          badge: "Popular",  useCases: ["File uploads", "Media storage", "Export downloads"],                         docsUrl: "https://docs.aws.amazon.com/s3/", description: "Store and retrieve files, images, and documents in S3 buckets with IAM credentials." },
  // AI
  { id: "elevenlabs",name: "ElevenLabs",      emoji: "🎙️", tagline: "AI voice & text-to-speech",    category: "AI",            badge: "New",      useCases: ["Voice interfaces", "Audiobooks", "Video narration"],                         docsUrl: "https://elevenlabs.io/docs", description: "Generate human-quality speech in any voice and language using ElevenLabs AI." },
  { id: "firecrawl", name: "Firecrawl",       emoji: "🔥", tagline: "Web scraping & extraction",    category: "AI",            badge: "New",      useCases: ["Competitor analysis", "Content aggregation", "Price tracking"],              docsUrl: "https://docs.firecrawl.dev/", description: "Scrape, crawl, and extract clean content from any website — no browser needed." },
  { id: "perplexity",name: "Perplexity",      emoji: "🔍", tagline: "AI-powered web search",        category: "AI",            badge: "New",      useCases: ["Research assistant", "Fact checking", "Live information"],                    docsUrl: "https://docs.perplexity.ai/", description: "Add web-backed AI search to your app — get cited, real-time answers from the web." },
  // Commerce
  { id: "stripe",   name: "Stripe",           emoji: "💳", tagline: "Payments & subscriptions",     category: "Commerce",      badge: "Popular",  useCases: ["SaaS billing", "One-time purchases", "Marketplace payments"],                 docsUrl: "https://stripe.com/docs/api", description: "Accept payments, manage subscriptions, and handle billing events with Stripe." },
  { id: "shopify",  name: "Shopify",          emoji: "🛍️", tagline: "Ecommerce store management",  category: "Commerce",      badge: "Popular",  useCases: ["Product catalog", "Order management", "Inventory sync"],                      docsUrl: "https://shopify.dev/docs/api", description: "Build custom storefronts and admin tools on top of Shopify's commerce APIs." },
  // Productivity
  { id: "hubspot",  name: "HubSpot",          emoji: "🧡", tagline: "CRM & marketing automation",   category: "Productivity",  badge: "Popular",  useCases: ["Lead capture", "Deal tracking", "Email sequences"],                          docsUrl: "https://developers.hubspot.com/", description: "Read and write CRM contacts, deals, companies, and automate sales workflows." },
  { id: "linear",   name: "Linear",           emoji: "📐", tagline: "Issue tracking & sprints",     category: "Productivity",                      useCases: ["Bug reports", "Feature requests", "Sprint sync"],                            docsUrl: "https://developers.linear.app/docs", description: "Create issues, update statuses, and integrate Linear project data into your app." },
  { id: "asana",    name: "Asana",            emoji: "🌸", tagline: "Task & project management",    category: "Productivity",                      useCases: ["Task creation", "Project tracking", "Team workload"],                        docsUrl: "https://developers.asana.com/docs", description: "Create and manage Asana tasks, read project data, and automate team workflows." },
  { id: "google_workspace", name: "Google Workspace", emoji: "🔵", tagline: "Gmail, Drive, Calendar & Sheets", category: "Productivity", badge: "Popular", useCases: ["Email sending", "Calendar scheduling", "Sheet data"],    docsUrl: "https://developers.google.com/workspace", description: "Integrate Gmail, Google Drive, Calendar, Sheets, and Docs into your app's workflows." },
  // Infrastructure
  { id: "github",   name: "GitHub",           emoji: "🐙", tagline: "Repos, issues & CI/CD",       category: "Infrastructure", badge: "Popular", useCases: ["Issue tracking", "PR creation", "Webhook handlers"],                         docsUrl: "https://docs.github.com/en/rest", description: "Read repos, create issues, open PRs, and react to webhook events from GitHub." },
];

const CATEGORIES = ["All", "Communication", "Data", "AI", "Commerce", "Productivity", "Infrastructure"] as const;

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  Communication: "Reach users via email, SMS, chat, and more",
  Data: "Connect to databases, warehouses, and data platforms",
  AI: "Add AI capabilities and intelligent content to your app",
  Commerce: "Accept payments and manage ecommerce operations",
  Productivity: "Sync with the tools your team already uses",
  Infrastructure: "Connect to developer platforms and cloud services",
};

// ─── Connector card ───────────────────────────────────────────────────────────

function ConnectorCard({ c }: { c: MarketingConnector }) {
  return (
    <div className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/[0.05] flex items-center justify-center text-2xl">
            {c.emoji}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white text-sm">{c.name}</h3>
              {c.badge && (
                <Badge
                  variant="outline"
                  className={`text-[9px] h-4 px-1.5 ${
                    c.badge === "Popular" ? "border-violet-500/40 text-violet-400" :
                    c.badge === "New"     ? "border-emerald-500/40 text-emerald-400" :
                    "border-sky-500/40 text-sky-400"
                  }`}
                >
                  {c.badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400">{c.tagline}</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">{c.description}</p>

      <ul className="space-y-1">
        {c.useCases.map((uc) => (
          <li key={uc} className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <CheckCircle2 className="w-3 h-3 text-emerald-500/60 shrink-0" />
            {uc}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 pt-1 mt-auto">
        <Link href="/dashboard" className="flex-1">
          <Button size="sm" className="w-full h-8 text-xs gap-1.5">
            Add to project <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
        <a href={c.docsUrl} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline" className="h-8 text-xs px-3">Docs</Button>
        </a>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ConnectorsMarketplace() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("All");

  const filtered = useMemo(() => {
    return CONNECTORS.filter((c) => {
      const matchCat = category === "All" || c.category === category;
      const q = search.toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.tagline.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [search, category]);

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-6">
          <Zap className="w-3.5 h-3.5" /> 20+ integrations · zero config
        </div>
        <h1 className="text-5xl font-bold tracking-tight mb-4">
          Connect your app to<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-sky-400">
            everything
          </span>
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
          Add Slack alerts, Stripe payments, Notion databases, and 17 more integrations to any project — no backend code needed.
        </p>

        {/* Search */}
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search connectors…"
            className="h-11 pl-10 pr-10 bg-white/[0.05] border-white/[0.08] text-sm focus:bg-white/[0.08] focus:border-violet-500/50"
          />
          {search && (
            <button className="absolute right-3.5 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="w-4 h-4 text-slate-500" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="border-b border-white/[0.06] sticky top-0 z-10 bg-[#09090b]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto py-3 no-scrollbar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  category === cat
                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {category !== "All" && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-1">{category}</h2>
            <p className="text-sm text-slate-400">{CATEGORY_DESCRIPTIONS[category]}</p>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <p className="text-lg font-medium text-white">No connectors found</p>
            <p className="text-sm text-slate-400">Try a different search or category.</p>
            <Button variant="outline" onClick={() => { setSearch(""); setCategory("All"); }}>
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((c) => <ConnectorCard key={c.id} c={c} />)}
          </div>
        )}

        {/* CTA */}
        <div className="mt-20 rounded-3xl bg-gradient-to-br from-violet-500/10 to-sky-500/10 border border-white/[0.06] p-10 text-center">
          <h3 className="text-2xl font-bold mb-3">Need a custom integration?</h3>
          <p className="text-slate-400 mb-6 max-w-lg mx-auto">
            Connect any API with LifemarkAI — just describe what you need and the AI builds the integration automatically.
          </p>
          <Link href="/dashboard">
            <Button size="lg" className="gap-2">
              Start building <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
