"use client";

/**
 * AppConnectorsPanel
 * 20 real app integrations with OAuth / API-key connection flows.
 * Credentials are saved to project env vars via /api/projects/[id]/env.
 * Groups: Communication, Data, AI, Commerce, Productivity
 */

import { useState, useEffect, useMemo } from "react";
import {
  Plug, Search, CheckCircle2, Circle, ChevronRight, ChevronDown,
  ExternalLink, Key, RefreshCw, Loader2, X, Eye, EyeOff,
  AlertCircle, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Connector catalogue ──────────────────────────────────────────────────────

interface ConnectorField {
  key: string;            // env var key
  label: string;
  placeholder: string;
  secret?: boolean;
  helpUrl?: string;
}

interface Connector {
  id: string;
  name: string;
  description: string;
  category: "Communication" | "Data" | "AI" | "Commerce" | "Productivity" | "Infrastructure";
  emoji: string;
  color: string;
  fields: ConnectorField[];
  docsUrl: string;
  oauthFlow?: boolean;    // show "Connect with OAuth" instead of key form
}

const CONNECTORS: Connector[] = [
  // ── Communication ──────────────────────────────────────────────────────────
  {
    id: "slack",
    name: "Slack",
    description: "Send alerts, post messages, and read channels",
    category: "Communication",
    emoji: "💬",
    color: "bg-[#4A154B]/20 text-purple-400",
    fields: [{ key: "SLACK_BOT_TOKEN", label: "Bot Token", placeholder: "xoxb-…", secret: true, helpUrl: "https://api.slack.com/authentication/token-types" }],
    docsUrl: "https://api.slack.com/",
    oauthFlow: true,
  },
  {
    id: "resend",
    name: "Resend",
    description: "Send transactional and marketing emails",
    category: "Communication",
    emoji: "📧",
    color: "bg-black/20 text-white",
    fields: [{ key: "RESEND_API_KEY", label: "API Key", placeholder: "re_…", secret: true, helpUrl: "https://resend.com/api-keys" }],
    docsUrl: "https://resend.com/docs",
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "SMS, MMS, and voice calls from your app",
    category: "Communication",
    emoji: "📱",
    color: "bg-red-500/20 text-red-400",
    fields: [
      { key: "TWILIO_ACCOUNT_SID", label: "Account SID", placeholder: "ACxxxx…", secret: false },
      { key: "TWILIO_AUTH_TOKEN", label: "Auth Token", placeholder: "••••••••", secret: true, helpUrl: "https://console.twilio.com/" },
      { key: "TWILIO_PHONE_NUMBER", label: "From Number", placeholder: "+1555…", secret: false },
    ],
    docsUrl: "https://www.twilio.com/docs",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Send messages and receive commands via bots",
    category: "Communication",
    emoji: "✈️",
    color: "bg-sky-500/20 text-sky-400",
    fields: [
      { key: "TELEGRAM_BOT_TOKEN", label: "Bot Token", placeholder: "123456:ABC…", secret: true, helpUrl: "https://core.telegram.org/bots#creating-a-new-bot" },
      { key: "TELEGRAM_CHAT_ID", label: "Chat ID", placeholder: "-100…", secret: false },
    ],
    docsUrl: "https://core.telegram.org/bots/api",
  },
  {
    id: "mailgun",
    name: "Mailgun",
    description: "Transactional email with delivery tracking",
    category: "Communication",
    emoji: "🔫",
    color: "bg-orange-500/20 text-orange-400",
    fields: [
      { key: "MAILGUN_API_KEY", label: "API Key", placeholder: "key-…", secret: true },
      { key: "MAILGUN_DOMAIN", label: "Domain", placeholder: "mg.yourdomain.com", secret: false },
    ],
    docsUrl: "https://documentation.mailgun.com/",
  },

  // ── Data ───────────────────────────────────────────────────────────────────
  {
    id: "airtable",
    name: "Airtable",
    description: "Read and write Airtable bases and records",
    category: "Data",
    emoji: "🟡",
    color: "bg-yellow-500/20 text-yellow-400",
    fields: [
      { key: "AIRTABLE_API_KEY", label: "Personal Access Token", placeholder: "pat…", secret: true, helpUrl: "https://airtable.com/create/tokens" },
      { key: "AIRTABLE_BASE_ID", label: "Base ID", placeholder: "app…", secret: false },
    ],
    docsUrl: "https://airtable.com/developers/web/api/introduction",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Read and write pages and databases",
    category: "Data",
    emoji: "⬛",
    color: "bg-stone-500/20 text-stone-300",
    fields: [{ key: "NOTION_API_KEY", label: "Integration Secret", placeholder: "secret_…", secret: true, helpUrl: "https://www.notion.so/my-integrations" }],
    docsUrl: "https://developers.notion.com/",
    oauthFlow: true,
  },
  {
    id: "snowflake",
    name: "Snowflake",
    description: "Query data and run SQL against Snowflake",
    category: "Data",
    emoji: "❄️",
    color: "bg-sky-400/20 text-sky-300",
    fields: [
      { key: "SNOWFLAKE_ACCOUNT", label: "Account Identifier", placeholder: "xy12345.us-east-1", secret: false },
      { key: "SNOWFLAKE_USERNAME", label: "Username", placeholder: "MY_USER", secret: false },
      { key: "SNOWFLAKE_PASSWORD", label: "Password", placeholder: "••••••••", secret: true },
      { key: "SNOWFLAKE_DATABASE", label: "Database", placeholder: "MY_DB", secret: false },
      { key: "SNOWFLAKE_WAREHOUSE", label: "Warehouse", placeholder: "COMPUTE_WH", secret: false },
    ],
    docsUrl: "https://docs.snowflake.com/",
  },
  {
    id: "bigquery",
    name: "BigQuery",
    description: "Query datasets and build analytics on Google BigQuery",
    category: "Data",
    emoji: "📊",
    color: "bg-blue-500/20 text-blue-400",
    fields: [
      { key: "BIGQUERY_PROJECT_ID", label: "Project ID", placeholder: "my-gcp-project", secret: false },
      { key: "BIGQUERY_SERVICE_ACCOUNT_JSON", label: "Service Account JSON", placeholder: '{"type":"service_account"…}', secret: true, helpUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts" },
    ],
    docsUrl: "https://cloud.google.com/bigquery/docs",
  },
  {
    id: "aws_s3",
    name: "AWS S3",
    description: "Read and write files in S3 buckets",
    category: "Data",
    emoji: "🪣",
    color: "bg-orange-600/20 text-orange-400",
    fields: [
      { key: "AWS_ACCESS_KEY_ID", label: "Access Key ID", placeholder: "AKIA…", secret: false },
      { key: "AWS_SECRET_ACCESS_KEY", label: "Secret Access Key", placeholder: "••••••••", secret: true, helpUrl: "https://console.aws.amazon.com/iam/home#/security_credentials" },
      { key: "AWS_REGION", label: "Region", placeholder: "us-east-1", secret: false },
      { key: "AWS_S3_BUCKET", label: "Bucket Name", placeholder: "my-bucket", secret: false },
    ],
    docsUrl: "https://docs.aws.amazon.com/s3/",
  },

  // ── AI ─────────────────────────────────────────────────────────────────────
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "AI text-to-speech and voice generation",
    category: "AI",
    emoji: "🎙️",
    color: "bg-violet-500/20 text-violet-400",
    fields: [{ key: "ELEVENLABS_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://elevenlabs.io/app/settings/api-keys" }],
    docsUrl: "https://elevenlabs.io/docs",
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    description: "Scrape, crawl, and extract website content",
    category: "AI",
    emoji: "🔥",
    color: "bg-red-500/20 text-red-400",
    fields: [{ key: "FIRECRAWL_API_KEY", label: "API Key", placeholder: "fc-…", secret: true, helpUrl: "https://www.firecrawl.dev/app/api-keys" }],
    docsUrl: "https://docs.firecrawl.dev/",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    description: "Web-backed AI search and research",
    category: "AI",
    emoji: "🔍",
    color: "bg-teal-500/20 text-teal-400",
    fields: [{ key: "PERPLEXITY_API_KEY", label: "API Key", placeholder: "pplx-…", secret: true, helpUrl: "https://www.perplexity.ai/settings/api" }],
    docsUrl: "https://docs.perplexity.ai/",
  },

  // ── Commerce ───────────────────────────────────────────────────────────────
  {
    id: "stripe",
    name: "Stripe",
    description: "Payments, subscriptions, and billing",
    category: "Commerce",
    emoji: "💳",
    color: "bg-indigo-500/20 text-indigo-400",
    fields: [
      { key: "STRIPE_SECRET_KEY", label: "Secret Key", placeholder: "sk_…", secret: true, helpUrl: "https://dashboard.stripe.com/apikeys" },
      { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", label: "Publishable Key", placeholder: "pk_…", secret: false },
      { key: "STRIPE_WEBHOOK_SECRET", label: "Webhook Secret", placeholder: "whsec_…", secret: true },
    ],
    docsUrl: "https://stripe.com/docs/api",
  },
  {
    id: "shopify",
    name: "Shopify",
    description: "Manage ecommerce store, products, and orders",
    category: "Commerce",
    emoji: "🛍️",
    color: "bg-green-500/20 text-green-400",
    fields: [
      { key: "SHOPIFY_SHOP_NAME", label: "Shop Name", placeholder: "my-store", secret: false },
      { key: "SHOPIFY_ACCESS_TOKEN", label: "Admin API Token", placeholder: "shpat_…", secret: true, helpUrl: "https://admin.shopify.com/store/YOUR_STORE/settings/apps/development" },
    ],
    docsUrl: "https://shopify.dev/docs/api",
  },

  // ── Productivity ───────────────────────────────────────────────────────────
  {
    id: "hubspot",
    name: "HubSpot",
    description: "CRM contacts, deals, and marketing workflows",
    category: "Productivity",
    emoji: "🧡",
    color: "bg-orange-500/20 text-orange-400",
    fields: [{ key: "HUBSPOT_ACCESS_TOKEN", label: "Private App Token", placeholder: "pat-…", secret: true, helpUrl: "https://app.hubspot.com/private-apps" }],
    docsUrl: "https://developers.hubspot.com/",
    oauthFlow: true,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Create and update issues, read project data",
    category: "Productivity",
    emoji: "📐",
    color: "bg-violet-600/20 text-violet-300",
    fields: [{ key: "LINEAR_API_KEY", label: "API Key", placeholder: "lin_api_…", secret: true, helpUrl: "https://linear.app/settings/api" }],
    docsUrl: "https://developers.linear.app/docs",
  },
  {
    id: "asana",
    name: "Asana",
    description: "Create tasks and read project data",
    category: "Productivity",
    emoji: "🌸",
    color: "bg-pink-500/20 text-pink-400",
    fields: [{ key: "ASANA_ACCESS_TOKEN", label: "Personal Access Token", placeholder: "1/…", secret: true, helpUrl: "https://app.asana.com/0/developer-console" }],
    docsUrl: "https://developers.asana.com/docs",
    oauthFlow: true,
  },
  {
    id: "google_workspace",
    name: "Google Workspace",
    description: "Gmail, Calendar, Drive, Sheets, and Docs",
    category: "Productivity",
    emoji: "🔵",
    color: "bg-blue-500/20 text-blue-400",
    fields: [
      { key: "GOOGLE_CLIENT_ID", label: "OAuth Client ID", placeholder: "…apps.googleusercontent.com", secret: false, helpUrl: "https://console.cloud.google.com/apis/credentials" },
      { key: "GOOGLE_CLIENT_SECRET", label: "OAuth Client Secret", placeholder: "GOCSPX-…", secret: true },
      { key: "GOOGLE_REFRESH_TOKEN", label: "Refresh Token", placeholder: "1//0g…", secret: true },
    ],
    docsUrl: "https://developers.google.com/workspace",
    oauthFlow: true,
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "List events, create meetings, manage calendars",
    category: "Productivity",
    emoji: "📅",
    color: "bg-blue-500/20 text-blue-400",
    fields: [
      { key: "GOOGLE_ACCESS_TOKEN", label: "OAuth Access Token", placeholder: "ya29.…", secret: true, helpUrl: "https://developers.google.com/calendar/api/guides/auth" },
    ],
    docsUrl: "https://developers.google.com/calendar/api",
    oauthFlow: true,
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    description: "Read and write spreadsheet rows and ranges",
    category: "Productivity",
    emoji: "📊",
    color: "bg-green-600/20 text-green-400",
    fields: [
      { key: "GOOGLE_ACCESS_TOKEN", label: "OAuth Access Token", placeholder: "ya29.…", secret: true, helpUrl: "https://developers.google.com/sheets/api/guides/authorizing" },
    ],
    docsUrl: "https://developers.google.com/sheets/api",
    oauthFlow: true,
  },

  // ── Infrastructure ─────────────────────────────────────────────────────────
  {
    id: "github",
    name: "GitHub",
    description: "Repos, issues, PRs, and commit webhooks",
    category: "Infrastructure",
    emoji: "🐙",
    color: "bg-stone-500/20 text-stone-300",
    fields: [{ key: "GITHUB_ACCESS_TOKEN", label: "Personal Access Token", placeholder: "ghp_…", secret: true, helpUrl: "https://github.com/settings/tokens/new" }],
    docsUrl: "https://docs.github.com/en/rest",
    oauthFlow: true,
  },

  // ── Lovable-parity connectors (added 2026-05) ───────────────────────────────
  {
    id: "ashby",
    name: "Ashby",
    description: "Hiring — jobs, candidates, applications, recruiter workflows",
    category: "Productivity",
    emoji: "🪪",
    color: "bg-indigo-500/20 text-indigo-300",
    fields: [{ key: "ASHBY_API_KEY", label: "API Key", placeholder: "ashby_…", secret: true, helpUrl: "https://developers.ashbyhq.com/" }],
    docsUrl: "https://developers.ashbyhq.com/",
    oauthFlow: false,
  },
  {
    id: "attention",
    name: "Attention",
    description: "Sales conversation intelligence — meeting transcripts, scorecards",
    category: "Productivity",
    emoji: "🎙️",
    color: "bg-purple-500/20 text-purple-300",
    fields: [{ key: "ATTENTION_API_KEY", label: "API Key", placeholder: "attn_…", secret: true, helpUrl: "https://attention.tech/" }],
    docsUrl: "https://docs.attention.tech/",
    oauthFlow: false,
  },
  {
    id: "databricks",
    name: "Databricks",
    description: "Query warehouse data, build dashboards, power data-driven apps",
    category: "Data",
    emoji: "🧱",
    color: "bg-orange-500/20 text-orange-300",
    fields: [
      { key: "DATABRICKS_HOST", label: "Workspace host", placeholder: "dbc-xxxx.cloud.databricks.com", secret: false },
      { key: "DATABRICKS_TOKEN", label: "Personal Access Token", placeholder: "dapi…", secret: true, helpUrl: "https://docs.databricks.com/dev-tools/auth.html" },
    ],
    docsUrl: "https://docs.databricks.com/en/integrations/index.html",
    oauthFlow: false,
  },
  {
    id: "brevo",
    name: "Brevo",
    description: "Transactional + marketing email, contacts, lists",
    category: "Communication",
    emoji: "📧",
    color: "bg-emerald-500/20 text-emerald-300",
    fields: [{ key: "BREVO_API_KEY", label: "API Key", placeholder: "xkeysib-…", secret: true, helpUrl: "https://app.brevo.com/settings/keys/api" }],
    docsUrl: "https://developers.brevo.com/",
    oauthFlow: false,
  },
  {
    id: "contentful",
    name: "Contentful",
    description: "Headless CMS — fetch published entries, assets, and rich text",
    category: "Productivity",
    emoji: "📝",
    color: "bg-blue-500/20 text-blue-300",
    fields: [
      { key: "CONTENTFUL_SPACE_ID", label: "Space ID", placeholder: "abcdef123", secret: false },
      { key: "CONTENTFUL_ACCESS_TOKEN", label: "Delivery API Token", placeholder: "CFPAT-…", secret: true, helpUrl: "https://app.contentful.com/spaces/_/api/keys" },
    ],
    docsUrl: "https://www.contentful.com/developers/docs/",
    oauthFlow: false,
  },
  {
    id: "fireflies",
    name: "Fireflies",
    description: "Meeting transcripts, summaries, and conversation insights",
    category: "Productivity",
    emoji: "🪰",
    color: "bg-yellow-500/20 text-yellow-300",
    fields: [{ key: "FIREFLIES_API_KEY", label: "API Key", placeholder: "ff_…", secret: true, helpUrl: "https://fireflies.ai/dashboard/settings/integrations" }],
    docsUrl: "https://docs.fireflies.ai/",
    oauthFlow: false,
  },
  {
    id: "gemini_enterprise",
    name: "Gemini Enterprise",
    description: "Search & summarize connected enterprise data with grounded answers",
    category: "AI",
    emoji: "💎",
    color: "bg-cyan-500/20 text-cyan-300",
    fields: [
      { key: "GEMINI_ENTERPRISE_PROJECT", label: "GCP Project ID", placeholder: "my-project", secret: false },
      { key: "GEMINI_ENTERPRISE_ENGINE", label: "Engine ID", placeholder: "search-engine-id", secret: false },
      { key: "GEMINI_ENTERPRISE_API_KEY", label: "API Key", placeholder: "…", secret: true },
    ],
    docsUrl: "https://cloud.google.com/gemini/docs/discover",
    oauthFlow: false,
  },
  {
    id: "google_maps",
    name: "Google Maps Platform",
    description: "Geocoding, routing, places, weather, and air-quality data",
    category: "Data",
    emoji: "🗺️",
    color: "bg-red-500/20 text-red-300",
    fields: [{ key: "GOOGLE_MAPS_API_KEY", label: "API Key", placeholder: "AIza…", secret: true, helpUrl: "https://console.cloud.google.com/google/maps-apis" }],
    docsUrl: "https://developers.google.com/maps/documentation",
    oauthFlow: false,
  },
  {
    id: "google_search_console",
    name: "Google Search Console",
    description: "Verify domains, submit sitemaps, read search analytics",
    category: "Data",
    emoji: "🔎",
    color: "bg-blue-600/20 text-blue-400",
    fields: [
      { key: "GSC_CLIENT_ID", label: "OAuth Client ID", placeholder: "…apps.googleusercontent.com", secret: false },
      { key: "GSC_CLIENT_SECRET", label: "OAuth Client Secret", placeholder: "GOCSPX-…", secret: true },
      { key: "GSC_REFRESH_TOKEN", label: "Refresh Token", placeholder: "1//0g…", secret: true },
    ],
    docsUrl: "https://developers.google.com/webmaster-tools/v1/",
    oauthFlow: true,
  },
  {
    id: "inngest",
    name: "Inngest",
    description: "Background jobs, scheduled tasks, durable workflows",
    category: "Infrastructure",
    emoji: "⏱️",
    color: "bg-violet-500/20 text-violet-300",
    fields: [
      { key: "INNGEST_EVENT_KEY", label: "Event Key", placeholder: "…", secret: true, helpUrl: "https://app.inngest.com/env/production/manage/keys" },
      { key: "INNGEST_SIGNING_KEY", label: "Signing Key", placeholder: "signkey-prod-…", secret: true },
    ],
    docsUrl: "https://www.inngest.com/docs",
    oauthFlow: false,
  },
  {
    id: "microsoft_365",
    name: "Microsoft 365",
    description: "Outlook, Teams, OneDrive, Word, Excel, PowerPoint — one Graph integration",
    category: "Productivity",
    emoji: "🪟",
    color: "bg-sky-500/20 text-sky-300",
    fields: [
      { key: "MS_TENANT_ID", label: "Tenant ID", placeholder: "your-tenant.onmicrosoft.com", secret: false },
      { key: "MS_CLIENT_ID", label: "App Client ID", placeholder: "GUID", secret: false },
      { key: "MS_CLIENT_SECRET", label: "App Secret", placeholder: "…", secret: true, helpUrl: "https://portal.azure.com/" },
      { key: "MS_ACCESS_TOKEN", label: "Graph Access Token", placeholder: "eyJ…", secret: true, helpUrl: "https://learn.microsoft.com/en-us/graph/auth/" },
    ],
    docsUrl: "https://learn.microsoft.com/en-us/graph/overview",
    oauthFlow: true,
  },
  {
    id: "storyblok",
    name: "Storyblok",
    description: "Headless CMS with visual page builder — stories, components, assets",
    category: "Productivity",
    emoji: "🧱",
    color: "bg-teal-500/20 text-teal-300",
    fields: [{ key: "STORYBLOK_ACCESS_TOKEN", label: "Access Token", placeholder: "preview/public token", secret: true, helpUrl: "https://app.storyblok.com/#/me/spaces/" }],
    docsUrl: "https://www.storyblok.com/docs/api",
    oauthFlow: false,
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "Read creator profiles, published videos, social integrations",
    category: "Communication",
    emoji: "🎵",
    color: "bg-rose-500/20 text-rose-300",
    fields: [
      { key: "TIKTOK_CLIENT_KEY", label: "Client Key", placeholder: "awxxx…", secret: false },
      { key: "TIKTOK_CLIENT_SECRET", label: "Client Secret", placeholder: "…", secret: true, helpUrl: "https://developers.tiktok.com/" },
    ],
    docsUrl: "https://developers.tiktok.com/doc/login-kit-web/",
    oauthFlow: true,
  },
  {
    id: "twitch",
    name: "Twitch",
    description: "Stream overlays, live channel data, viewer tools",
    category: "Communication",
    emoji: "🟣",
    color: "bg-purple-500/20 text-purple-300",
    fields: [
      { key: "TWITCH_CLIENT_ID", label: "Client ID", placeholder: "…", secret: false },
      { key: "TWITCH_CLIENT_SECRET", label: "Client Secret", placeholder: "…", secret: true, helpUrl: "https://dev.twitch.tv/console/apps" },
    ],
    docsUrl: "https://dev.twitch.tv/docs/api/",
    oauthFlow: true,
  },
  {
    id: "wordpress",
    name: "WordPress.com",
    description: "Headless CMS — fetch posts, pages, media via REST",
    category: "Productivity",
    emoji: "🅦",
    color: "bg-blue-700/20 text-blue-300",
    fields: [
      { key: "WORDPRESS_SITE", label: "Site URL", placeholder: "example.wordpress.com", secret: false },
      { key: "WORDPRESS_TOKEN", label: "OAuth Token", placeholder: "…", secret: true },
    ],
    docsUrl: "https://developer.wordpress.com/docs/api/",
    oauthFlow: true,
  },
];

const CATEGORIES = ["All", "Communication", "Data", "AI", "Commerce", "Productivity", "Infrastructure"] as const;

// ─── ConnectorCard ─────────────────────────────────────────────────────────────

function ConnectorCard({
  connector,
  connected,
  onConnect,
  onDisconnect,
}: {
  connector: Connector;
  connected: boolean;
  onConnect: (id: string, values: Record<string, string>) => Promise<void>;
  onDisconnect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const missing = connector.fields.filter((f) => !values[f.key]?.trim());
    if (missing.length > 0) {
      setError(`Fill in: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConnect(connector.id, values);
      setOpen(false);
    } catch {
      setError("Failed to save credentials. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`rounded-xl border transition-all ${connected ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"}`}>
      {/* Card header */}
      <button
        className="w-full flex items-center gap-3 p-3 text-left"
        onClick={() => !connected && setOpen((v) => !v)}
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${connector.color}`}>
          {connector.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold">{connector.name}</p>
            {connected && (
              <span className="flex items-center gap-0.5 text-[9px] text-emerald-400">
                <CheckCircle2 className="w-2.5 h-2.5" /> Connected
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{connector.description}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {connected ? (
            <Button
              size="sm" variant="ghost"
              className="h-6 text-[10px] text-red-400 hover:text-red-300 px-2"
              onClick={(e) => { e.stopPropagation(); onDisconnect(connector.id); }}
            >
              Disconnect
            </Button>
          ) : (
            <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          )}
        </div>
      </button>

      {/* Expanded form */}
      {open && !connected && (
        <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-2">
          {connector.oauthFlow && (
            <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-sky-500/5 border border-sky-500/15">
              <Zap className="w-3 h-3 text-sky-400 shrink-0" />
              <p className="text-[10px] text-sky-300">OAuth is available — paste your credentials below or use the OAuth flow in production.</p>
            </div>
          )}

          {connector.fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">{field.label}</label>
                {field.helpUrl && (
                  <a href={field.helpUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/50 hover:text-muted-foreground" />
                  </a>
                )}
              </div>
              <div className="relative">
                <Input
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  type={field.secret && !revealed[field.key] ? "password" : "text"}
                  className="h-7 text-xs font-mono pr-8"
                />
                {field.secret && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setRevealed((r) => ({ ...r, [field.key]: !r[field.key] }))}
                  >
                    {revealed[field.key]
                      ? <EyeOff className="w-3 h-3 text-muted-foreground" />
                      : <Eye className="w-3 h-3 text-muted-foreground" />}
                  </button>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-1.5 text-[10px] text-red-400">
              <AlertCircle className="w-3 h-3 shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-1.5 pt-1">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Key className="w-3 h-3 mr-1" />}
              Save & Connect
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
            <a href={connector.docsUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface AppConnectorsPanelProps {
  projectId: string;
}

export function AppConnectorsPanel({ projectId }: AppConnectorsPanelProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("All");
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Load which connectors are already configured
  useEffect(() => {
    fetch(`/api/projects/${projectId}/env`)
      .then((r) => r.ok ? r.json() : { envVars: [] })
      .then((data: { envVars: Array<{ key: string }> }) => {
        const keys = new Set((data.envVars ?? []).map((e: { key: string }) => e.key));
        const connectedIds = new Set<string>();
        for (const c of CONNECTORS) {
          if (c.fields.every((f) => keys.has(f.key))) {
            connectedIds.add(c.id);
          }
        }
        setConnected(connectedIds);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleConnect(id: string, values: Record<string, string>) {
    // Save each field as an env var
    await Promise.all(
      Object.entries(values).map(([key, value]) =>
        fetch(`/api/projects/${projectId}/env`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        })
      )
    );
    setConnected((prev) => new Set([...prev, id]));
  }

  function handleDisconnect(id: string) {
    const c = CONNECTORS.find((x) => x.id === id);
    if (!c) return;
    // Remove all keys for this connector
    Promise.all(
      c.fields.map((f) =>
        fetch(`/api/projects/${projectId}/env/${f.key}`, { method: "DELETE" }).catch(() => null)
      )
    ).then(() => {
      setConnected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }

  const filtered = useMemo(() => {
    return CONNECTORS.filter((c) => {
      const matchCat = category === "All" || c.category === category;
      const matchSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [search, category]);

  const connectedFirst = [...filtered].sort((a, b) => {
    const ac = connected.has(a.id) ? 0 : 1;
    const bc = connected.has(b.id) ? 0 : 1;
    return ac - bc;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Plug className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-xs font-semibold flex-1">App Connectors</span>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {connected.size} connected
        </Badge>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search connectors…"
            className="h-7 pl-6 text-xs"
          />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Category chips */}
      <div className="flex gap-1 px-3 py-2 border-b border-border overflow-x-auto shrink-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
              category === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Loading connectors…</p>
            </div>
          ) : connectedFirst.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Plug className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm font-medium">No connectors found</p>
              <p className="text-xs text-muted-foreground">Try a different search or category.</p>
            </div>
          ) : (
            connectedFirst.map((c) => (
              <ConnectorCard
                key={c.id}
                connector={c}
                connected={connected.has(c.id)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2.5 shrink-0">
        <p className="text-[9px] text-muted-foreground text-center">
          Credentials are encrypted and stored as project environment variables.
        </p>
      </div>
    </div>
  );
}
