
/**
 * AppConnectorsPanel
 * 50+ real app integrations with OAuth / API-key connection flows.
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
import { useToast } from "@/hooks/use-toast";

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

export const CONNECTORS: Connector[] = [
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
    color: "bg-stone-500/20 text-stone-700 dark:text-stone-300",
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
    color: "bg-sky-400/20 text-sky-700 dark:text-sky-300",
    fields: [
      { key: "SNOWFLAKE_ACCOUNT_URL", label: "Account URL", placeholder: "https://xy12345.us-east-1.snowflakecomputing.com", secret: false },
      { key: "SNOWFLAKE_TOKEN", label: "OAuth / PAT Token", placeholder: "••••••••", secret: true, helpUrl: "https://docs.snowflake.com/en/developer-guide/sql-api/authenticating" },
    ],
    docsUrl: "https://docs.snowflake.com/en/developer-guide/sql-api/index",
  },
  {
    id: "bigquery",
    name: "BigQuery",
    description: "Query datasets and build analytics on Google BigQuery",
    category: "Data",
    emoji: "📊",
    color: "bg-blue-500/20 text-blue-400",
    fields: [
      { key: "GOOGLE_OAUTH_TOKEN", label: "OAuth Access Token", placeholder: "ya29.…", secret: true, helpUrl: "https://cloud.google.com/bigquery/docs/authentication" },
    ],
    docsUrl: "https://cloud.google.com/bigquery/docs/reference/rest",
  },
  {
    id: "aws_s3",
    name: "AWS S3",
    description: "Read and write files in S3 buckets",
    category: "Data",
    emoji: "🪣",
    color: "bg-orange-600/20 text-orange-400",
    // Asks for a SESSION TOKEN, not an access key pair. The gateway injects
    // static headers and cannot compute a SigV4 signature per request, so a
    // key/secret pair could never have worked here — and until now this card had
    // no registry entry at all, so it was configurable and inert. Projects that
    // need long-lived key-based S3 access should sign in an edge function.
    fields: [
      { key: "AWS_REGION", label: "Region", placeholder: "us-east-1", secret: false },
      { key: "AWS_SESSION_TOKEN", label: "Session Token", placeholder: "…", secret: true, helpUrl: "https://docs.aws.amazon.com/STS/latest/APIReference/API_GetSessionToken.html" },
      { key: "AWS_S3_BUCKET", label: "Bucket Name", placeholder: "my-bucket", secret: false },
    ],
    docsUrl: "https://docs.aws.amazon.com/s3/",
  },
  {
    // Also missing from this panel while present in the gateway registry, so the
    // gateway would forward for it but nobody could configure it.
    id: "openai",
    name: "OpenAI",
    description: "Call OpenAI models directly from your app",
    category: "AI",
    emoji: "🧠",
    color: "bg-emerald-500/20 text-emerald-400",
    fields: [{ key: "OPENAI_API_KEY", label: "API Key", placeholder: "sk-…", secret: true, helpUrl: "https://platform.openai.com/api-keys" }],
    docsUrl: "https://platform.openai.com/docs/api-reference",
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
    color: "bg-violet-600/20 text-violet-700 dark:text-violet-300",
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
    color: "bg-stone-500/20 text-stone-700 dark:text-stone-300",
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
    color: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
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
    color: "bg-purple-500/20 text-purple-700 dark:text-purple-300",
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
    color: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
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
    color: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
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
    color: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
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
    color: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
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
    color: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300",
    // Collected GEMINI_ENTERPRISE_API_KEY, but the gateway entry requires
    // GOOGLE_ACCESS_TOKEN — so filling this form in could never satisfy the
    // connector. Discovery Engine takes an OAuth bearer token, not an API key,
    // so the registry was right and the form was asking for the wrong thing.
    fields: [
      { key: "GEMINI_ENTERPRISE_PROJECT", label: "GCP Project ID", placeholder: "my-project", secret: false },
      { key: "GEMINI_ENTERPRISE_ENGINE", label: "Engine ID", placeholder: "search-engine-id", secret: false },
      { key: "GOOGLE_ACCESS_TOKEN", label: "OAuth Access Token", placeholder: "ya29.…", secret: true, helpUrl: "https://cloud.google.com/docs/authentication/token-types#access" },
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
    color: "bg-red-500/20 text-red-700 dark:text-red-300",
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
    color: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
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
    color: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
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
    color: "bg-teal-500/20 text-teal-700 dark:text-teal-300",
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
    color: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
    fields: [
      { key: "TIKTOK_ACCESS_TOKEN", label: "Access Token", placeholder: "act.…", secret: true, helpUrl: "https://developers.tiktok.com/doc/oauth-user-access-token-management" },
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
    color: "bg-purple-500/20 text-purple-700 dark:text-purple-300",
    fields: [
      { key: "TWITCH_CLIENT_ID", label: "Client ID", placeholder: "…", secret: false, helpUrl: "https://dev.twitch.tv/console/apps" },
      { key: "TWITCH_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true, helpUrl: "https://dev.twitch.tv/docs/authentication/" },
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
    color: "bg-blue-700/20 text-blue-700 dark:text-blue-300",
    fields: [
      { key: "WORDPRESS_SITE", label: "Site URL", placeholder: "example.wordpress.com", secret: false },
      { key: "WORDPRESS_TOKEN", label: "OAuth Token", placeholder: "…", secret: true },
    ],
    docsUrl: "https://developer.wordpress.com/docs/api/",
    oauthFlow: true,
  },

  // ── Growth + analytics connectors (added 2026-07) ───────────────────────────
  {
    id: "salesforce",
    name: "Salesforce",
    description: "CRM records, leads, opportunities via the REST API",
    category: "Productivity",
    emoji: "☁️",
    color: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
    fields: [
      { key: "SALESFORCE_INSTANCE_URL", label: "Instance URL", placeholder: "https://mydomain.my.salesforce.com", secret: false },
      { key: "SALESFORCE_ACCESS_TOKEN", label: "Access Token", placeholder: "00D…", secret: true, helpUrl: "https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_tokens_scopes.htm" },
    ],
    docsUrl: "https://developer.salesforce.com/docs/apis",
    oauthFlow: true,
  },
  {
    id: "algolia",
    name: "Algolia",
    description: "Hosted search — index records and query with instant results",
    category: "Data",
    emoji: "🔷",
    color: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
    fields: [
      { key: "ALGOLIA_APP_ID", label: "Application ID", placeholder: "ABC123XYZ", secret: false },
      { key: "ALGOLIA_API_KEY", label: "Admin API Key", placeholder: "…", secret: true, helpUrl: "https://dashboard.algolia.com/account/api-keys" },
    ],
    docsUrl: "https://www.algolia.com/doc/rest-api/search/",
    oauthFlow: false,
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Error tracking — read issues, events, and release health",
    category: "Infrastructure",
    emoji: "🛡️",
    color: "bg-purple-600/20 text-purple-700 dark:text-purple-300",
    fields: [{ key: "SENTRY_AUTH_TOKEN", label: "Auth Token", placeholder: "sntrys_…", secret: true, helpUrl: "https://sentry.io/settings/account/api/auth-tokens/" }],
    docsUrl: "https://docs.sentry.io/api/",
    oauthFlow: false,
  },
  {
    id: "posthog",
    name: "PostHog",
    description: "Product analytics — events, insights, feature flags, session data",
    category: "Data",
    emoji: "🦔",
    color: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
    fields: [
      { key: "POSTHOG_API_KEY", label: "Personal API Key", placeholder: "phx_…", secret: true, helpUrl: "https://us.posthog.com/settings/user-api-keys" },
      { key: "POSTHOG_HOST", label: "Host (optional region)", placeholder: "https://us.posthog.com", secret: false },
    ],
    docsUrl: "https://posthog.com/docs/api",
    oauthFlow: false,
  },
  {
    id: "semrush",
    name: "Semrush",
    description: "SEO analytics — keyword research, domain rankings, backlinks",
    category: "Data",
    emoji: "📈",
    color: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    fields: [{ key: "SEMRUSH_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://www.semrush.com/api-analytics/" }],
    docsUrl: "https://developer.semrush.com/api/",
    oauthFlow: false,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Share posts, read profile and organization data",
    category: "Communication",
    emoji: "💼",
    color: "bg-blue-600/20 text-blue-700 dark:text-blue-300",
    fields: [{ key: "LINKEDIN_ACCESS_TOKEN", label: "OAuth Access Token", placeholder: "AQV…", secret: true, helpUrl: "https://www.linkedin.com/developers/apps" }],
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/",
    oauthFlow: true,
  },
  {
    id: "granola",
    name: "Granola",
    description: "AI meeting notes — transcripts, summaries, and action items",
    category: "Productivity",
    emoji: "🥣",
    color: "bg-lime-500/20 text-lime-700 dark:text-lime-300",
    fields: [{ key: "GRANOLA_API_KEY", label: "API Key", placeholder: "grn_…", secret: true, helpUrl: "https://www.granola.ai/" }],
    docsUrl: "https://www.granola.ai/docs",
    oauthFlow: false,
  },

  // ── Batch added 2026-07 (registry-backed, gateway-routable) ─────────────────
  {
    id: "gitlab",
    name: "GitLab",
    description: "Repos, merge requests, issues, and CI pipelines",
    category: "Infrastructure",
    emoji: "🦊",
    color: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
    fields: [{ key: "GITLAB_TOKEN", label: "Personal Access Token", placeholder: "glpat-…", secret: true, helpUrl: "https://gitlab.com/-/user_settings/personal_access_tokens" }],
    docsUrl: "https://docs.gitlab.com/ee/api/",
    oauthFlow: true,
  },
  {
    id: "discord",
    name: "Discord",
    description: "Post messages, manage channels, and run bots",
    category: "Communication",
    emoji: "🎮",
    color: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
    fields: [{ key: "DISCORD_BOT_TOKEN", label: "Bot Token", placeholder: "MToX…", secret: true, helpUrl: "https://discord.com/developers/applications" }],
    docsUrl: "https://discord.com/developers/docs/reference",
    oauthFlow: false,
  },
  {
    id: "jira",
    name: "Jira",
    description: "Create and track issues, sprints, and boards",
    category: "Productivity",
    emoji: "🧭",
    color: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
    fields: [
      { key: "JIRA_DOMAIN", label: "Site", placeholder: "mycompany.atlassian.net", secret: false },
      { key: "JIRA_EMAIL", label: "Account Email", placeholder: "you@company.com", secret: false },
      { key: "JIRA_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://id.atlassian.com/manage-profile/security/api-tokens" },
    ],
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/",
    oauthFlow: false,
  },
  {
    id: "zendesk",
    name: "Zendesk",
    description: "Support tickets, users, and help-center content",
    category: "Productivity",
    emoji: "🎫",
    color: "bg-emerald-600/20 text-emerald-700 dark:text-emerald-300",
    fields: [
      { key: "ZENDESK_SUBDOMAIN", label: "Subdomain", placeholder: "mycompany", secret: false },
      { key: "ZENDESK_EMAIL", label: "Agent Email", placeholder: "you@company.com", secret: false },
      { key: "ZENDESK_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://support.zendesk.com/hc/en-us/articles/4408889192858" },
    ],
    docsUrl: "https://developer.zendesk.com/api-reference/",
    oauthFlow: false,
  },
  {
    id: "intercom",
    name: "Intercom",
    description: "Conversations, contacts, and support automation",
    category: "Communication",
    emoji: "💬",
    color: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
    fields: [{ key: "INTERCOM_ACCESS_TOKEN", label: "Access Token", placeholder: "dG9r…", secret: true, helpUrl: "https://developers.intercom.com/building-apps/docs/authentication-types" }],
    docsUrl: "https://developers.intercom.com/intercom-api-reference/",
    oauthFlow: true,
  },
  {
    id: "calendly",
    name: "Calendly",
    description: "Scheduled events, invitees, and availability",
    category: "Productivity",
    emoji: "📆",
    color: "bg-blue-600/20 text-blue-700 dark:text-blue-300",
    fields: [{ key: "CALENDLY_TOKEN", label: "Personal Access Token", placeholder: "eyJ…", secret: true, helpUrl: "https://calendly.com/integrations/api_webhooks" }],
    docsUrl: "https://developer.calendly.com/api-docs",
    oauthFlow: true,
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    description: "Transactional and marketing email delivery",
    category: "Communication",
    emoji: "📨",
    color: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
    fields: [{ key: "SENDGRID_API_KEY", label: "API Key", placeholder: "SG.…", secret: true, helpUrl: "https://app.sendgrid.com/settings/api_keys" }],
    docsUrl: "https://docs.sendgrid.com/api-reference",
    oauthFlow: false,
  },
  {
    id: "aikido",
    name: "Aikido Security",
    description: "Code, cloud, and dependency security findings",
    category: "Infrastructure",
    emoji: "🥋",
    color: "bg-purple-500/20 text-purple-700 dark:text-purple-300",
    fields: [{ key: "AIKIDO_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://app.aikido.dev/settings/integrations/api" }],
    docsUrl: "https://apidocs.aikido.dev/",
    oauthFlow: false,
  },

  // ── Batch added 2026-07-30 (52 → 82 connectors) ────────────────────────────
  // Every id here MUST also exist in lib/integrations/connector-registry.ts.
  // The registry is what the gateway forwards through; this list is only the UI.
  // A connector present in one and missing from the other is either invisible or
  // unusable, and neither failure announces itself.
  //
  // Warehouse / BI
  {
    id: "redshift",
    name: "Amazon Redshift",
    description: "Query your Redshift warehouse via the Data API",
    category: "Data",
    emoji: "🧱",
    color: "bg-red-600/20 text-red-400",
    fields: [
      { key: "REDSHIFT_REGION", label: "AWS Region", placeholder: "us-east-1", secret: false },
      { key: "REDSHIFT_SESSION_TOKEN", label: "Session Token", placeholder: "…", secret: true, helpUrl: "https://docs.aws.amazon.com/redshift/latest/mgmt/data-api.html" },
    ],
    docsUrl: "https://docs.aws.amazon.com/redshift-data/latest/APIReference/",
  },
  {
    id: "athena",
    name: "AWS Athena",
    description: "Run SQL over data in S3",
    category: "Data",
    emoji: "🏛️",
    color: "bg-orange-500/20 text-orange-400",
    fields: [
      { key: "ATHENA_REGION", label: "AWS Region", placeholder: "us-east-1", secret: false },
      { key: "ATHENA_SESSION_TOKEN", label: "Session Token", placeholder: "…", secret: true },
    ],
    docsUrl: "https://docs.aws.amazon.com/athena/latest/APIReference/",
  },
  {
    id: "microsoft_fabric",
    name: "Microsoft Fabric",
    description: "Lakehouses, warehouses, and KQL from one API",
    category: "Data",
    emoji: "🧵",
    color: "bg-blue-500/20 text-blue-400",
    fields: [{ key: "FABRIC_ACCESS_TOKEN", label: "Entra Access Token", placeholder: "eyJ…", secret: true, helpUrl: "https://learn.microsoft.com/fabric/data-engineering/api-graphql-overview" }],
    docsUrl: "https://learn.microsoft.com/rest/api/fabric/",
  },
  {
    id: "clickhouse",
    name: "ClickHouse",
    description: "Fast analytical SQL over HTTPS",
    category: "Data",
    emoji: "🐎",
    color: "bg-yellow-500/20 text-yellow-400",
    fields: [
      { key: "CLICKHOUSE_HOST", label: "Host", placeholder: "abc.clickhouse.cloud:8443", secret: false },
      { key: "CLICKHOUSE_USER", label: "User", placeholder: "default", secret: false },
      { key: "CLICKHOUSE_PASSWORD", label: "Password", placeholder: "••••••••", secret: true },
    ],
    docsUrl: "https://clickhouse.com/docs/en/interfaces/http",
  },
  {
    id: "dbt",
    name: "dbt Semantic Layer",
    description: "Read governed metrics instead of re-deriving them",
    category: "Data",
    emoji: "📐",
    color: "bg-orange-600/20 text-orange-400",
    fields: [
      { key: "DBT_SERVICE_TOKEN", label: "Service Token", placeholder: "dbts_…", secret: true, helpUrl: "https://docs.getdbt.com/docs/dbt-cloud-apis/service-tokens" },
      { key: "DBT_HOST", label: "Host (optional)", placeholder: "semantic-layer.cloud.getdbt.com", secret: false },
    ],
    docsUrl: "https://docs.getdbt.com/docs/dbt-cloud-apis/sl-api-overview",
  },

  // Commerce
  {
    id: "woocommerce",
    name: "WooCommerce",
    description: "Products, orders, and customers on WordPress stores",
    category: "Commerce",
    emoji: "🛍️",
    color: "bg-purple-600/20 text-purple-400",
    fields: [
      { key: "WOOCOMMERCE_STORE", label: "Store URL", placeholder: "shop.example.com", secret: false },
      { key: "WOOCOMMERCE_KEY", label: "Consumer Key", placeholder: "ck_…", secret: false },
      { key: "WOOCOMMERCE_SECRET", label: "Consumer Secret", placeholder: "cs_…", secret: true, helpUrl: "https://woocommerce.com/document/woocommerce-rest-api/" },
    ],
    docsUrl: "https://woocommerce.github.io/woocommerce-rest-api-docs/",
  },
  {
    id: "prestashop",
    name: "PrestaShop",
    description: "Catalog and order management",
    category: "Commerce",
    emoji: "🧺",
    color: "bg-pink-500/20 text-pink-400",
    fields: [
      { key: "PRESTASHOP_STORE", label: "Store URL", placeholder: "shop.example.com", secret: false },
      { key: "PRESTASHOP_API_KEY", label: "Webservice Key", placeholder: "…", secret: true, helpUrl: "https://devdocs.prestashop-project.org/8/webservice/" },
    ],
    docsUrl: "https://devdocs.prestashop-project.org/8/webservice/",
  },
  {
    id: "wix",
    name: "Wix",
    description: "Stores, bookings, and CMS collections",
    category: "Commerce",
    emoji: "⬛",
    color: "bg-black/20 text-white",
    fields: [
      { key: "WIX_API_KEY", label: "API Key", placeholder: "IST.…", secret: true, helpUrl: "https://dev.wix.com/docs/rest/articles/getting-started/api-keys" },
      { key: "WIX_SITE_ID", label: "Site ID", placeholder: "uuid", secret: false },
    ],
    docsUrl: "https://dev.wix.com/docs/rest",
  },
  {
    id: "lightspeed",
    name: "Lightspeed Retail",
    description: "POS inventory, sales, and customers",
    category: "Commerce",
    emoji: "⚡",
    color: "bg-red-500/20 text-red-400",
    fields: [{ key: "LIGHTSPEED_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true }],
    docsUrl: "https://developers.lightspeedhq.com/retail/introduction/introduction/",
  },
  {
    id: "paddle",
    name: "Paddle",
    description: "Merchant-of-record subscriptions and checkout",
    category: "Commerce",
    emoji: "🛶",
    color: "bg-indigo-500/20 text-indigo-400",
    fields: [
      { key: "PADDLE_API_KEY", label: "API Key", placeholder: "pdl_…", secret: true, helpUrl: "https://developer.paddle.com/api-reference/about/authentication" },
      { key: "PADDLE_ENV", label: "Environment", placeholder: "live or sandbox", secret: false },
    ],
    docsUrl: "https://developer.paddle.com/api-reference/overview",
  },
  {
    id: "chargebee",
    name: "Chargebee",
    description: "Subscription billing and revenue operations",
    category: "Commerce",
    emoji: "🧾",
    color: "bg-orange-500/20 text-orange-400",
    fields: [
      { key: "CHARGEBEE_SITE", label: "Site Name", placeholder: "acme-test", secret: false },
      { key: "CHARGEBEE_API_KEY", label: "API Key", placeholder: "live_…", secret: true, helpUrl: "https://apidocs.chargebee.com/docs/api/auth" },
    ],
    docsUrl: "https://apidocs.chargebee.com/docs/api",
  },

  // Accounting
  {
    id: "xero",
    name: "Xero",
    description: "Invoices, contacts, and accounting reports",
    category: "Data",
    emoji: "💠",
    color: "bg-sky-500/20 text-sky-400",
    fields: [
      { key: "XERO_ACCESS_TOKEN", label: "Access Token", placeholder: "eyJ…", secret: true, helpUrl: "https://developer.xero.com/documentation/guides/oauth2/auth-flow/" },
      { key: "XERO_TENANT_ID", label: "Tenant ID", placeholder: "uuid", secret: false },
    ],
    docsUrl: "https://developer.xero.com/documentation/api/accounting/overview",
  },
  {
    id: "lexware",
    name: "Lexware Office",
    description: "German invoicing and bookkeeping",
    category: "Data",
    emoji: "📗",
    color: "bg-green-600/20 text-green-400",
    fields: [{ key: "LEXWARE_API_KEY", label: "API Key", placeholder: "…", secret: true }],
    docsUrl: "https://developers.lexware.io/docs/",
  },
  {
    id: "sevdesk",
    name: "sevDesk",
    description: "German invoicing, vouchers, and contacts",
    category: "Data",
    emoji: "📘",
    color: "bg-red-500/20 text-red-400",
    fields: [{ key: "SEVDESK_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://my.sevdesk.de/#/admin/userManagement" }],
    docsUrl: "https://api.sevdesk.de/",
  },
  {
    id: "wave",
    name: "Wave Accounting",
    description: "Invoicing and accounting (GraphQL)",
    category: "Data",
    emoji: "🌊",
    color: "bg-blue-600/20 text-blue-400",
    fields: [{ key: "WAVE_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true }],
    docsUrl: "https://developer.waveapps.com/hc/en-us/articles/360019968212",
  },
  {
    id: "zoho_books",
    name: "Zoho Books",
    description: "Invoices, bills, and ledgers",
    category: "Data",
    emoji: "📚",
    color: "bg-red-600/20 text-red-400",
    fields: [
      { key: "ZOHO_OAUTH_TOKEN", label: "OAuth Token", placeholder: "1000.…", secret: true, helpUrl: "https://www.zoho.com/books/api/v3/oauth/" },
      { key: "ZOHO_DC", label: "Data Centre", placeholder: "com, eu, in, com.au", secret: false },
    ],
    docsUrl: "https://www.zoho.com/books/api/v3/",
  },
  {
    id: "zoho_crm",
    name: "Zoho CRM",
    description: "Leads, deals, and contacts",
    category: "Productivity",
    emoji: "📇",
    color: "bg-red-500/20 text-red-400",
    fields: [
      { key: "ZOHO_OAUTH_TOKEN", label: "OAuth Token", placeholder: "1000.…", secret: true },
      { key: "ZOHO_DC", label: "Data Centre", placeholder: "com, eu, in, com.au", secret: false },
    ],
    docsUrl: "https://www.zoho.com/crm/developer/docs/api/v6/",
  },

  // Growth / data
  {
    id: "google_analytics",
    name: "Google Analytics 4",
    description: "Traffic, events, and conversion reports",
    category: "Data",
    emoji: "📈",
    color: "bg-yellow-500/20 text-yellow-400",
    fields: [{ key: "GOOGLE_ANALYTICS_ACCESS_TOKEN", label: "Access Token", placeholder: "ya29.…", secret: true, helpUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1" }],
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1/rest",
  },
  {
    id: "apollo",
    name: "Apollo.io",
    description: "B2B contact and company enrichment",
    category: "Data",
    emoji: "🚀",
    color: "bg-indigo-500/20 text-indigo-400",
    fields: [{ key: "APOLLO_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://docs.apollo.io/docs/create-api-key" }],
    docsUrl: "https://docs.apollo.io/reference",
  },
  {
    id: "apify",
    name: "Apify",
    description: "Run scrapers and browser automation Actors",
    category: "AI",
    emoji: "🕷️",
    color: "bg-green-500/20 text-green-400",
    fields: [{ key: "APIFY_TOKEN", label: "API Token", placeholder: "apify_api_…", secret: true, helpUrl: "https://console.apify.com/account/integrations" }],
    docsUrl: "https://docs.apify.com/api/v2",
  },
  {
    id: "tally",
    name: "Tally",
    description: "Forms, submissions, and webhooks",
    category: "Productivity",
    emoji: "📝",
    color: "bg-teal-500/20 text-teal-400",
    fields: [{ key: "TALLY_API_KEY", label: "API Key", placeholder: "tly-…", secret: true }],
    docsUrl: "https://developers.tally.so/",
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    description: "Deals, persons, and pipeline activity",
    category: "Productivity",
    emoji: "🔧",
    color: "bg-green-600/20 text-green-400",
    fields: [
      { key: "PIPEDRIVE_DOMAIN", label: "Company Domain", placeholder: "acme", secret: false },
      { key: "PIPEDRIVE_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://pipedrive.readme.io/docs/how-to-find-the-api-token" },
    ],
    docsUrl: "https://developers.pipedrive.com/docs/api/v1",
  },
  {
    id: "logodev",
    name: "Logo.dev",
    description: "Company logos by domain",
    category: "AI",
    emoji: "🖼️",
    color: "bg-slate-500/20 text-slate-300",
    fields: [{ key: "LOGODEV_API_KEY", label: "API Key", placeholder: "pk_…", secret: true }],
    docsUrl: "https://docs.logo.dev/",
  },
  {
    id: "klipy",
    name: "KLIPY",
    description: "GIFs, stickers, and AI emojis",
    category: "AI",
    emoji: "🎬",
    color: "bg-fuchsia-500/20 text-fuchsia-400",
    fields: [{ key: "KLIPY_API_KEY", label: "API Key", placeholder: "…", secret: true }],
    docsUrl: "https://docs.klipy.com/",
  },
  {
    id: "mapbox",
    name: "Mapbox",
    description: "Maps, geocoding, and routing",
    category: "Infrastructure",
    emoji: "🗺️",
    color: "bg-blue-500/20 text-blue-400",
    fields: [{ key: "MAPBOX_ACCESS_TOKEN", label: "Access Token", placeholder: "pk.…", secret: true, helpUrl: "https://console.mapbox.com/account/access-tokens/" }],
    docsUrl: "https://docs.mapbox.com/api/overview/",
  },

  // Content / media / misc
  {
    id: "sharepoint",
    name: "Microsoft SharePoint",
    description: "Sites, lists, and document libraries",
    category: "Productivity",
    emoji: "🗂️",
    color: "bg-blue-600/20 text-blue-400",
    fields: [{ key: "SHAREPOINT_ACCESS_TOKEN", label: "Graph Access Token", placeholder: "eyJ…", secret: true, helpUrl: "https://learn.microsoft.com/graph/auth/" }],
    docsUrl: "https://learn.microsoft.com/graph/api/resources/sharepoint",
  },
  {
    id: "heygen",
    name: "HeyGen",
    description: "AI avatar and video generation",
    category: "AI",
    emoji: "🎥",
    color: "bg-violet-500/20 text-violet-400",
    fields: [{ key: "HEYGEN_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://app.heygen.com/settings?nav=API" }],
    docsUrl: "https://docs.heygen.com/reference/overview",
  },
  {
    id: "replicate",
    name: "Replicate",
    description: "Run open-source AI models by API",
    category: "AI",
    emoji: "🔁",
    color: "bg-black/20 text-white",
    fields: [{ key: "REPLICATE_API_TOKEN", label: "API Token", placeholder: "r8_…", secret: true, helpUrl: "https://replicate.com/account/api-tokens" }],
    docsUrl: "https://replicate.com/docs/reference/http",
  },
  {
    id: "x",
    name: "X (Twitter)",
    description: "Read and post to X",
    category: "Communication",
    emoji: "✖️",
    color: "bg-black/20 text-white",
    fields: [{ key: "X_BEARER_TOKEN", label: "Bearer Token", placeholder: "AAAA…", secret: true, helpUrl: "https://developer.x.com/en/portal/dashboard" }],
    docsUrl: "https://docs.x.com/x-api/introduction",
  },
  // ── Batch added 2026-07-30 (136 → 180) ────────────────────────────────────
  // Headless CMS
  { id: "sanity", name: "Sanity", description: "Structured content and GROQ queries", category: "Data", emoji: "🧾", color: "bg-red-500/20 text-red-400",
    fields: [
      { key: "SANITY_PROJECT_ID", label: "Project ID", placeholder: "abc12345", secret: false },
      { key: "SANITY_TOKEN", label: "API Token", placeholder: "sk…", secret: true, helpUrl: "https://www.sanity.io/manage" },
    ], docsUrl: "https://www.sanity.io/docs/http-api" },
  { id: "strapi", name: "Strapi", description: "Self-hosted content types and entries", category: "Data", emoji: "🟪", color: "bg-purple-600/20 text-purple-400",
    fields: [
      { key: "STRAPI_HOST", label: "Host", placeholder: "cms.example.com", secret: false },
      { key: "STRAPI_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://docs.strapi.io/dev-docs/configurations/api-tokens" },
    ], docsUrl: "https://docs.strapi.io/dev-docs/api/rest" },
  { id: "directus", name: "Directus", description: "Instant REST and GraphQL over your database", category: "Data", emoji: "🟣", color: "bg-violet-600/20 text-violet-400",
    fields: [
      { key: "DIRECTUS_HOST", label: "Host", placeholder: "data.example.com", secret: false },
      { key: "DIRECTUS_TOKEN", label: "Static Token", placeholder: "…", secret: true, helpUrl: "https://docs.directus.io/reference/authentication.html" },
    ], docsUrl: "https://docs.directus.io/reference/introduction.html" },
  { id: "hygraph", name: "Hygraph", description: "GraphQL-native content federation", category: "Data", emoji: "🔺", color: "bg-pink-600/20 text-pink-400",
    fields: [
      { key: "HYGRAPH_ENDPOINT", label: "Content API Endpoint", placeholder: "api-eu-west-2.hygraph.com/v2/…/master", secret: false },
      { key: "HYGRAPH_TOKEN", label: "Permanent Auth Token", placeholder: "eyJ…", secret: true, helpUrl: "https://hygraph.com/docs/api-reference/basics/authorization" },
    ], docsUrl: "https://hygraph.com/docs/api-reference" },
  { id: "payload", name: "Payload CMS", description: "TypeScript-first collections and globals", category: "Data", emoji: "📦", color: "bg-slate-600/20 text-slate-300",
    fields: [
      { key: "PAYLOAD_HOST", label: "Host", placeholder: "cms.example.com", secret: false },
      { key: "PAYLOAD_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://payloadcms.com/docs/authentication/api-keys" },
    ], docsUrl: "https://payloadcms.com/docs/rest-api/overview" },
  { id: "prismic", name: "Prismic", description: "Slice-based content for marketing pages", category: "Data", emoji: "🅿️", color: "bg-neutral-600/20 text-neutral-300",
    fields: [
      { key: "PRISMIC_REPO", label: "Repository", placeholder: "my-repo", secret: false },
      { key: "PRISMIC_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true, helpUrl: "https://prismic.io/docs/access-token" },
    ], docsUrl: "https://prismic.io/docs/rest-api-technical-reference" },

  // Notifications & realtime
  { id: "onesignal", name: "OneSignal", description: "Push, email, and in-app messaging", category: "Communication", emoji: "🔔", color: "bg-red-500/20 text-red-400",
    fields: [{ key: "ONESIGNAL_REST_API_KEY", label: "REST API Key", placeholder: "…", secret: true, helpUrl: "https://dashboard.onesignal.com/" }],
    docsUrl: "https://documentation.onesignal.com/reference/rest-api-overview" },
  { id: "ably", name: "Ably", description: "Realtime pub/sub channels and presence", category: "Infrastructure", emoji: "📡", color: "bg-orange-500/20 text-orange-400",
    fields: [
      { key: "ABLY_KEY_NAME", label: "Key Name", placeholder: "appId.keyId", secret: false },
      { key: "ABLY_KEY_SECRET", label: "Key Secret", placeholder: "••••••••", secret: true, helpUrl: "https://ably.com/accounts" },
    ], docsUrl: "https://ably.com/docs/api/rest-api" },
  { id: "knock", name: "Knock", description: "Notification workflows across channels", category: "Communication", emoji: "🚪", color: "bg-indigo-500/20 text-indigo-400",
    fields: [{ key: "KNOCK_API_KEY", label: "Secret API Key", placeholder: "sk_…", secret: true, helpUrl: "https://dashboard.knock.app/" }],
    docsUrl: "https://docs.knock.app/reference" },
  { id: "novu", name: "Novu", description: "Open-source notification infrastructure", category: "Communication", emoji: "🅾️", color: "bg-emerald-600/20 text-emerald-400",
    fields: [{ key: "NOVU_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://dashboard.novu.co/api-keys" }],
    docsUrl: "https://docs.novu.co/api-reference/overview" },

  // Speech & audio
  { id: "deepgram", name: "Deepgram", description: "Speech-to-text and audio intelligence", category: "AI", emoji: "🎙️", color: "bg-green-500/20 text-green-400",
    fields: [{ key: "DEEPGRAM_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://console.deepgram.com/" }],
    docsUrl: "https://developers.deepgram.com/reference/" },
  { id: "assemblyai", name: "AssemblyAI", description: "Transcription, summaries, and speaker labels", category: "AI", emoji: "🅰️", color: "bg-blue-600/20 text-blue-400",
    fields: [{ key: "ASSEMBLYAI_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://www.assemblyai.com/app/account" }],
    docsUrl: "https://www.assemblyai.com/docs/api-reference/overview" },

  // Image & video generation
  { id: "fal", name: "fal.ai", description: "Fast hosted inference for image and video models", category: "AI", emoji: "⚡", color: "bg-purple-500/20 text-purple-400",
    fields: [{ key: "FAL_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://fal.ai/dashboard/keys" }],
    docsUrl: "https://docs.fal.ai/" },
  { id: "stability", name: "Stability AI", description: "Stable Diffusion image generation and edits", category: "AI", emoji: "🎨", color: "bg-fuchsia-600/20 text-fuchsia-400",
    fields: [{ key: "STABILITY_API_KEY", label: "API Key", placeholder: "sk-…", secret: true, helpUrl: "https://platform.stability.ai/account/keys" }],
    docsUrl: "https://platform.stability.ai/docs/api-reference" },
  { id: "runway", name: "Runway", description: "Generative video from text and images", category: "AI", emoji: "🛫", color: "bg-black/20 text-white",
    fields: [{ key: "RUNWAY_API_KEY", label: "API Key", placeholder: "key_…", secret: true, helpUrl: "https://dev.runwayml.com/" }],
    docsUrl: "https://docs.dev.runwayml.com/" },
  { id: "luma", name: "Luma AI", description: "Dream Machine video generation", category: "AI", emoji: "🌙", color: "bg-sky-600/20 text-sky-400",
    fields: [{ key: "LUMA_API_KEY", label: "API Key", placeholder: "luma-…", secret: true, helpUrl: "https://lumalabs.ai/dream-machine/api/keys" }],
    docsUrl: "https://docs.lumalabs.ai/docs/api" },

  // Project management
  { id: "clickup", name: "ClickUp", description: "Tasks, lists, spaces, and time tracking", category: "Productivity", emoji: "⬆️", color: "bg-pink-600/20 text-pink-400",
    fields: [{ key: "CLICKUP_API_TOKEN", label: "API Token", placeholder: "pk_…", secret: true, helpUrl: "https://app.clickup.com/settings/apps" }],
    docsUrl: "https://developer.clickup.com/reference/getauthorizeduser" },
  { id: "monday", name: "monday.com", description: "Boards, items, and column values", category: "Productivity", emoji: "📅", color: "bg-red-600/20 text-red-400",
    fields: [{ key: "MONDAY_API_TOKEN", label: "API Token", placeholder: "eyJ…", secret: true, helpUrl: "https://developer.monday.com/api-reference/docs/authentication" }],
    docsUrl: "https://developer.monday.com/api-reference/reference/about-the-api-reference" },
  { id: "coda", name: "Coda", description: "Docs, tables, and rows as an API", category: "Productivity", emoji: "🅲", color: "bg-orange-600/20 text-orange-400",
    fields: [{ key: "CODA_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://coda.io/account" }],
    docsUrl: "https://coda.io/developers/apis/v1" },
  { id: "height", name: "Height", description: "Tasks and lists for product teams", category: "Productivity", emoji: "📏", color: "bg-blue-600/20 text-blue-400",
    fields: [{ key: "HEIGHT_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://height.app/settings/api" }],
    // Points at the product site, not a deep docs path: Height hosts its API docs
    // on a Notion page whose id I could not verify, and a plausible-looking
    // fabricated URL is worse than a shallow correct one.
    docsUrl: "https://height.app" },
  { id: "shortcut", name: "Shortcut", description: "Stories, epics, and iterations", category: "Productivity", emoji: "🩳", color: "bg-indigo-600/20 text-indigo-400",
    fields: [{ key: "SHORTCUT_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://app.shortcut.com/settings/account/api-tokens" }],
    docsUrl: "https://developer.shortcut.com/api/rest/v3" },

  // E-signature & documents
  { id: "docusign", name: "DocuSign", description: "Envelopes, recipients, and signing flows", category: "Productivity", emoji: "✍️", color: "bg-yellow-600/20 text-yellow-400",
    fields: [
      { key: "DOCUSIGN_HOST", label: "Account Host", placeholder: "na3.docusign.net or demo.docusign.net", secret: false },
      { key: "DOCUSIGN_ACCESS_TOKEN", label: "Access Token", placeholder: "eyJ…", secret: true, helpUrl: "https://developers.docusign.com/platform/auth/" },
    ], docsUrl: "https://developers.docusign.com/docs/esign-rest-api/" },
  { id: "dropbox_sign", name: "Dropbox Sign", description: "Signature requests and templates", category: "Productivity", emoji: "🖊️", color: "bg-blue-500/20 text-blue-400",
    fields: [{ key: "DROPBOX_SIGN_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://app.hellosign.com/home/myAccount#api" }],
    docsUrl: "https://developers.hellosign.com/api/reference/" },
  { id: "pandadoc", name: "PandaDoc", description: "Proposals, quotes, and e-signature", category: "Productivity", emoji: "🐼", color: "bg-neutral-500/20 text-neutral-300",
    fields: [{ key: "PANDADOC_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://app.pandadoc.com/a/#/settings/integrations/api/dashboard" }],
    docsUrl: "https://developers.pandadoc.com/reference/about" },

  // Shipping & logistics
  { id: "shippo", name: "Shippo", description: "Rates, labels, and tracking", category: "Commerce", emoji: "📦", color: "bg-green-600/20 text-green-400",
    fields: [{ key: "SHIPPO_API_TOKEN", label: "API Token", placeholder: "shippo_live_…", secret: true, helpUrl: "https://apps.goshippo.com/settings/api" }],
    docsUrl: "https://docs.goshippo.com/shippoapi/public-api/" },
  { id: "easypost", name: "EasyPost", description: "Multi-carrier shipping and tracking", category: "Commerce", emoji: "🚚", color: "bg-sky-500/20 text-sky-400",
    fields: [{ key: "EASYPOST_API_KEY", label: "API Key", placeholder: "EZAK…", secret: true, helpUrl: "https://www.easypost.com/account/api-keys" }],
    docsUrl: "https://docs.easypost.com/docs/addresses" },
  { id: "aftership", name: "AfterShip", description: "Shipment tracking across carriers", category: "Commerce", emoji: "🛳️", color: "bg-amber-600/20 text-amber-400",
    fields: [{ key: "AFTERSHIP_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://admin.aftership.com/settings/api-keys" }],
    docsUrl: "https://www.aftership.com/docs/tracking/quickstart/api-quick-start" },

  // Localisation
  { id: "deepl", name: "DeepL", description: "High-quality machine translation", category: "AI", emoji: "🌐", color: "bg-blue-700/20 text-blue-400",
    fields: [
      { key: "DEEPL_AUTH_KEY", label: "Auth Key", placeholder: "…:fx", secret: true, helpUrl: "https://www.deepl.com/your-account/keys" },
      { key: "DEEPL_PLAN", label: "Plan", placeholder: "pro or free", secret: false },
    ], docsUrl: "https://developers.deepl.com/docs" },
  { id: "lokalise", name: "Lokalise", description: "Translation keys and project workflows", category: "Productivity", emoji: "🗺️", color: "bg-indigo-500/20 text-indigo-400",
    fields: [{ key: "LOKALISE_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://app.lokalise.com/profile#apitokens" }],
    docsUrl: "https://developers.lokalise.com/reference/lokalise-rest-api" },
  { id: "crowdin", name: "Crowdin", description: "Localisation projects and strings", category: "Productivity", emoji: "🈯", color: "bg-teal-600/20 text-teal-400",
    fields: [{ key: "CROWDIN_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://crowdin.com/settings#api-key" }],
    docsUrl: "https://developer.crowdin.com/api/v2/" },

  // Recruiting
  { id: "greenhouse", name: "Greenhouse", description: "Candidates, jobs, and scorecards", category: "Productivity", emoji: "🌿", color: "bg-green-700/20 text-green-400",
    fields: [{ key: "GREENHOUSE_API_KEY", label: "Harvest API Key", placeholder: "…", secret: true, helpUrl: "https://developers.greenhouse.io/harvest.html#authentication" }],
    docsUrl: "https://developers.greenhouse.io/harvest.html" },
  { id: "lever", name: "Lever", description: "Opportunities, postings, and stages", category: "Productivity", emoji: "🎚️", color: "bg-slate-500/20 text-slate-300",
    fields: [{ key: "LEVER_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://hire.lever.co/settings/integrations" }],
    docsUrl: "https://hire.lever.co/developer/documentation" },
  { id: "workable", name: "Workable", description: "Jobs, candidates, and pipelines", category: "Productivity", emoji: "💼", color: "bg-blue-600/20 text-blue-400",
    fields: [
      { key: "WORKABLE_SUBDOMAIN", label: "Subdomain", placeholder: "mycompany", secret: false },
      { key: "WORKABLE_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true, helpUrl: "https://help.workable.com/hc/en-us/articles/115015785428" },
    ], docsUrl: "https://developers.workable.com/" },

  // Accounting
  { id: "quickbooks", name: "QuickBooks Online", description: "Invoices, customers, and accounts", category: "Data", emoji: "📗", color: "bg-green-600/20 text-green-400",
    fields: [
      { key: "QUICKBOOKS_REALM_ID", label: "Realm (Company) ID", placeholder: "1234567890", secret: false },
      { key: "QUICKBOOKS_ACCESS_TOKEN", label: "Access Token", placeholder: "eyJ…", secret: true, helpUrl: "https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization" },
      { key: "QUICKBOOKS_ENV", label: "Environment", placeholder: "production or sandbox", secret: false },
    ], docsUrl: "https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account" },
  { id: "freshbooks", name: "FreshBooks", description: "Invoicing and expenses for small business", category: "Data", emoji: "📘", color: "bg-blue-500/20 text-blue-400",
    fields: [{ key: "FRESHBOOKS_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true, helpUrl: "https://my.freshbooks.com/#/developer" }],
    docsUrl: "https://www.freshbooks.com/api/start" },

  // Enrichment & market data
  { id: "peopledatalabs", name: "People Data Labs", description: "Person and company enrichment", category: "Data", emoji: "🧑‍💼", color: "bg-cyan-600/20 text-cyan-400",
    fields: [{ key: "PDL_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://dashboard.peopledatalabs.com/api-keys" }],
    docsUrl: "https://docs.peopledatalabs.com/docs/reference" },
  { id: "polygon", name: "Polygon.io", description: "Stocks, options, forex, and crypto data", category: "Data", emoji: "📈", color: "bg-violet-600/20 text-violet-400",
    fields: [{ key: "POLYGON_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://polygon.io/dashboard/api-keys" }],
    docsUrl: "https://polygon.io/docs" },
  { id: "finnhub", name: "Finnhub", description: "Market data, fundamentals, and news", category: "Data", emoji: "🐟", color: "bg-emerald-600/20 text-emerald-400",
    fields: [{ key: "FINNHUB_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://finnhub.io/dashboard" }],
    docsUrl: "https://finnhub.io/docs/api" },

  // Video & meetings
  { id: "daily", name: "Daily", description: "WebRTC video rooms and recordings", category: "Communication", emoji: "📹", color: "bg-purple-600/20 text-purple-400",
    fields: [{ key: "DAILY_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://dashboard.daily.co/developers" }],
    docsUrl: "https://docs.daily.co/reference/rest-api" },
  { id: "livekit", name: "LiveKit", description: "Realtime audio, video, and agents", category: "Communication", emoji: "🎛️", color: "bg-cyan-500/20 text-cyan-400",
    fields: [
      { key: "LIVEKIT_HOST", label: "Server URL", placeholder: "myapp.livekit.cloud", secret: false },
      { key: "LIVEKIT_ACCESS_TOKEN", label: "Access Token (JWT)", placeholder: "eyJ…", secret: true, helpUrl: "https://docs.livekit.io/home/get-started/authentication/" },
    ], docsUrl: "https://docs.livekit.io/reference/server/server-apis/" },
  { id: "vimeo", name: "Vimeo", description: "Video upload, privacy, and embeds", category: "Communication", emoji: "🎞️", color: "bg-sky-600/20 text-sky-400",
    fields: [{ key: "VIMEO_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true, helpUrl: "https://developer.vimeo.com/apps" }],
    docsUrl: "https://developer.vimeo.com/api/reference" },

  // Auth (additional)
  { id: "stytch", name: "Stytch", description: "Passwordless, OTP, and B2B auth", category: "Infrastructure", emoji: "🪪", color: "bg-emerald-500/20 text-emerald-400",
    fields: [
      { key: "STYTCH_PROJECT_ID", label: "Project ID", placeholder: "project-live-…", secret: false },
      { key: "STYTCH_SECRET", label: "Secret", placeholder: "secret-live-…", secret: true, helpUrl: "https://stytch.com/dashboard/api-keys" },
      { key: "STYTCH_ENV", label: "Environment", placeholder: "live or test", secret: false },
    ], docsUrl: "https://stytch.com/docs/api" },
  { id: "kinde", name: "Kinde", description: "Users, organisations, and permissions", category: "Infrastructure", emoji: "🔑", color: "bg-lime-600/20 text-lime-400",
    fields: [
      { key: "KINDE_DOMAIN", label: "Domain", placeholder: "myapp.kinde.com", secret: false },
      { key: "KINDE_ACCESS_TOKEN", label: "Access Token", placeholder: "eyJ…", secret: true, helpUrl: "https://docs.kinde.com/kinde-apis/management/" },
    ], docsUrl: "https://docs.kinde.com/kinde-apis/management/" },

  // Scheduling
  { id: "calcom", name: "Cal.com", description: "Open-source scheduling and bookings", category: "Productivity", emoji: "🗓️", color: "bg-neutral-600/20 text-neutral-300",
    fields: [{ key: "CALCOM_API_KEY", label: "API Key", placeholder: "cal_live_…", secret: true, helpUrl: "https://app.cal.com/settings/developer/api-keys" }],
    docsUrl: "https://cal.com/docs/api-reference/v2/introduction" },

  // ── Batch added 2026-07-30 (96 → 136) ─────────────────────────────────────
  // Every id here MUST exist in lib/integrations/connector-registry.ts. Payments
  {
    id: "paypal",
    name: "PayPal",
    description: "Orders, captures, subscriptions, and payouts",
    category: "Commerce",
    emoji: "🅿️",
    color: "bg-blue-600/20 text-blue-400",
    fields: [
      { key: "PAYPAL_ACCESS_TOKEN", label: "Access Token", placeholder: "A21AA…", secret: true, helpUrl: "https://developer.paypal.com/api/rest/authentication/" },
      { key: "PAYPAL_ENV", label: "Environment", placeholder: "live or sandbox", secret: false },
    ],
    docsUrl: "https://developer.paypal.com/api/rest/",
  },
  {
    id: "square",
    name: "Square",
    description: "Payments, catalog, orders, and customers",
    category: "Commerce",
    emoji: "⬜",
    color: "bg-neutral-500/20 text-neutral-300",
    fields: [
      { key: "SQUARE_ACCESS_TOKEN", label: "Access Token", placeholder: "EAAA…", secret: true, helpUrl: "https://developer.squareup.com/apps" },
      { key: "SQUARE_ENV", label: "Environment", placeholder: "production or sandbox", secret: false },
    ],
    docsUrl: "https://developer.squareup.com/reference/square",
  },
  {
    id: "adyen",
    name: "Adyen",
    description: "Global payment processing and checkout sessions",
    category: "Commerce",
    emoji: "🟢",
    color: "bg-green-600/20 text-green-400",
    fields: [
      { key: "ADYEN_API_KEY", label: "API Key", placeholder: "AQE…", secret: true, helpUrl: "https://docs.adyen.com/development-resources/api-credentials/" },
      { key: "ADYEN_ENV", label: "Environment", placeholder: "live or test", secret: false },
    ],
    docsUrl: "https://docs.adyen.com/api-explorer/",
  },
  {
    id: "razorpay",
    name: "Razorpay",
    description: "Payments and subscriptions for India",
    category: "Commerce",
    emoji: "💳",
    color: "bg-sky-600/20 text-sky-400",
    fields: [
      { key: "RAZORPAY_KEY_ID", label: "Key ID", placeholder: "rzp_live_…", secret: false },
      { key: "RAZORPAY_KEY_SECRET", label: "Key Secret", placeholder: "••••••••", secret: true, helpUrl: "https://dashboard.razorpay.com/app/keys" },
    ],
    docsUrl: "https://razorpay.com/docs/api/",
  },
  {
    id: "mollie",
    name: "Mollie",
    description: "European payments and recurring billing",
    category: "Commerce",
    emoji: "🇳🇱",
    color: "bg-slate-500/20 text-slate-300",
    fields: [{ key: "MOLLIE_API_KEY", label: "API Key", placeholder: "live_…", secret: true, helpUrl: "https://my.mollie.com/dashboard/developers/api-keys" }],
    docsUrl: "https://docs.mollie.com/reference/overview",
  },
  {
    id: "coinbase_commerce",
    name: "Coinbase Commerce",
    description: "Accept cryptocurrency payments",
    category: "Commerce",
    emoji: "₿",
    color: "bg-amber-500/20 text-amber-400",
    fields: [{ key: "COINBASE_COMMERCE_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://beta.commerce.coinbase.com/settings/security" }],
    docsUrl: "https://docs.cdp.coinbase.com/commerce/docs/welcome",
  },

  // Email & marketing
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Audiences, campaigns, and automations",
    category: "Communication",
    emoji: "🐵",
    color: "bg-yellow-500/20 text-yellow-400",
    fields: [
      { key: "MAILCHIMP_API_KEY", label: "API Key", placeholder: "abc123…-us14", secret: true, helpUrl: "https://mailchimp.com/help/about-api-keys/" },
      { key: "MAILCHIMP_DC", label: "Datacentre", placeholder: "us14 (tail of your key)", secret: false },
    ],
    docsUrl: "https://mailchimp.com/developer/marketing/api/",
  },
  {
    id: "postmark",
    name: "Postmark",
    description: "Transactional email with delivery detail",
    category: "Communication",
    emoji: "📮",
    color: "bg-yellow-600/20 text-yellow-400",
    fields: [{ key: "POSTMARK_SERVER_TOKEN", label: "Server Token", placeholder: "uuid", secret: true, helpUrl: "https://account.postmarkapp.com/servers" }],
    docsUrl: "https://postmarkapp.com/developer/api/overview",
  },
  {
    id: "klaviyo",
    name: "Klaviyo",
    description: "Ecommerce email, SMS, and segments",
    category: "Communication",
    emoji: "📣",
    color: "bg-black/20 text-white",
    fields: [{ key: "KLAVIYO_API_KEY", label: "Private API Key", placeholder: "pk_…", secret: true, helpUrl: "https://www.klaviyo.com/settings/account/api-keys" }],
    docsUrl: "https://developers.klaviyo.com/en/reference/api_overview",
  },
  {
    id: "customerio",
    name: "Customer.io",
    description: "Behavioural messaging and journeys",
    category: "Communication",
    emoji: "✉️",
    color: "bg-purple-500/20 text-purple-400",
    fields: [{ key: "CUSTOMERIO_APP_API_KEY", label: "App API Key", placeholder: "…", secret: true, helpUrl: "https://fly.customer.io/settings/api_credentials" }],
    docsUrl: "https://docs.customer.io/api/app/",
  },
  {
    id: "loops",
    name: "Loops",
    description: "Simple product email for SaaS",
    category: "Communication",
    emoji: "🔁",
    color: "bg-pink-500/20 text-pink-400",
    fields: [{ key: "LOOPS_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://app.loops.so/settings?page=api" }],
    docsUrl: "https://loops.so/docs/api-reference/intro",
  },

  // Storage & CDN
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "DNS, R2, Workers, and zone settings",
    category: "Infrastructure",
    emoji: "🟠",
    color: "bg-orange-500/20 text-orange-400",
    fields: [{ key: "CLOUDFLARE_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://dash.cloudflare.com/profile/api-tokens" }],
    docsUrl: "https://developers.cloudflare.com/api/",
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    description: "Image and video upload, transform, and delivery",
    category: "Infrastructure",
    emoji: "🖼️",
    color: "bg-blue-500/20 text-blue-400",
    fields: [
      { key: "CLOUDINARY_CLOUD_NAME", label: "Cloud Name", placeholder: "my-cloud", secret: false },
      { key: "CLOUDINARY_API_KEY", label: "API Key", placeholder: "123456789", secret: false },
      { key: "CLOUDINARY_API_SECRET", label: "API Secret", placeholder: "••••••••", secret: true, helpUrl: "https://console.cloudinary.com/settings/api-keys" },
    ],
    docsUrl: "https://cloudinary.com/documentation/admin_api",
  },
  {
    id: "uploadcare",
    name: "Uploadcare",
    description: "File uploads, processing, and delivery",
    category: "Infrastructure",
    emoji: "📤",
    color: "bg-green-500/20 text-green-400",
    fields: [
      { key: "UPLOADCARE_PUBLIC_KEY", label: "Public Key", placeholder: "…", secret: false },
      { key: "UPLOADCARE_SECRET_KEY", label: "Secret Key", placeholder: "••••••••", secret: true, helpUrl: "https://app.uploadcare.com/projects/" },
    ],
    docsUrl: "https://uploadcare.com/api-refs/rest-api/",
  },
  {
    id: "bunny",
    name: "Bunny.net",
    description: "CDN, storage zones, and video streaming",
    category: "Infrastructure",
    emoji: "🐰",
    color: "bg-orange-400/20 text-orange-300",
    fields: [{ key: "BUNNY_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://dash.bunny.net/account/settings" }],
    docsUrl: "https://docs.bunny.net/reference/bunnynet-api-overview",
  },

  // Auth & identity
  {
    id: "auth0",
    name: "Auth0",
    description: "Users, roles, and tenant management",
    category: "Infrastructure",
    emoji: "🔐",
    color: "bg-orange-600/20 text-orange-400",
    fields: [
      { key: "AUTH0_DOMAIN", label: "Domain", placeholder: "myapp.eu.auth0.com", secret: false },
      { key: "AUTH0_ACCESS_TOKEN", label: "Management Token", placeholder: "eyJ…", secret: true, helpUrl: "https://auth0.com/docs/secure/tokens/access-tokens/management-api-access-tokens" },
    ],
    docsUrl: "https://auth0.com/docs/api/management/v2",
  },
  {
    id: "clerk",
    name: "Clerk",
    description: "Users, sessions, and organisations",
    category: "Infrastructure",
    emoji: "👤",
    color: "bg-violet-500/20 text-violet-400",
    fields: [{ key: "CLERK_SECRET_KEY", label: "Secret Key", placeholder: "sk_live_…", secret: true, helpUrl: "https://dashboard.clerk.com/last-active?path=api-keys" }],
    docsUrl: "https://clerk.com/docs/reference/backend-api",
  },
  {
    id: "workos",
    name: "WorkOS",
    description: "Enterprise SSO, directory sync, and audit logs",
    category: "Infrastructure",
    emoji: "🏛️",
    color: "bg-indigo-500/20 text-indigo-400",
    fields: [{ key: "WORKOS_API_KEY", label: "API Key", placeholder: "sk_…", secret: true, helpUrl: "https://dashboard.workos.com/api-keys" }],
    docsUrl: "https://workos.com/docs/reference",
  },

  // Databases
  {
    id: "mongodb",
    name: "MongoDB Atlas",
    description: "Documents via the Atlas Data API",
    category: "Data",
    emoji: "🍃",
    color: "bg-green-600/20 text-green-400",
    fields: [
      { key: "MONGODB_APP_ID", label: "Data API App ID", placeholder: "data-abcde", secret: false },
      { key: "MONGODB_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://www.mongodb.com/docs/atlas/app-services/data-api/" },
    ],
    docsUrl: "https://www.mongodb.com/docs/atlas/app-services/data-api/openapi/",
  },
  {
    id: "upstash",
    name: "Upstash Redis",
    description: "Serverless Redis over HTTPS",
    category: "Data",
    emoji: "⚡",
    color: "bg-emerald-500/20 text-emerald-400",
    fields: [
      { key: "UPSTASH_REDIS_URL", label: "REST URL", placeholder: "eu1-xyz.upstash.io", secret: false },
      { key: "UPSTASH_REDIS_TOKEN", label: "REST Token", placeholder: "…", secret: true, helpUrl: "https://console.upstash.com/" },
    ],
    docsUrl: "https://upstash.com/docs/redis/features/restapi",
  },
  {
    id: "neon",
    name: "Neon",
    description: "Serverless Postgres branches and endpoints",
    category: "Data",
    emoji: "🌱",
    color: "bg-lime-500/20 text-lime-400",
    fields: [{ key: "NEON_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://console.neon.tech/app/settings/api-keys" }],
    docsUrl: "https://api-docs.neon.tech/reference/getting-started-with-neon-api",
  },
  {
    id: "turso",
    name: "Turso",
    description: "Edge SQLite databases and replicas",
    category: "Data",
    emoji: "🐢",
    color: "bg-teal-500/20 text-teal-400",
    fields: [{ key: "TURSO_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://docs.turso.tech/api-reference/quickstart" }],
    docsUrl: "https://docs.turso.tech/api-reference",
  },

  // Observability
  {
    id: "datadog",
    name: "Datadog",
    description: "Metrics, logs, monitors, and incidents",
    category: "Infrastructure",
    emoji: "🐶",
    color: "bg-purple-600/20 text-purple-400",
    fields: [
      { key: "DATADOG_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://app.datadoghq.com/organization-settings/api-keys" },
      { key: "DATADOG_APP_KEY", label: "Application Key", placeholder: "…", secret: true },
      { key: "DATADOG_SITE", label: "Site", placeholder: "datadoghq.com or datadoghq.eu", secret: false },
    ],
    docsUrl: "https://docs.datadoghq.com/api/latest/",
  },
  {
    id: "newrelic",
    name: "New Relic",
    description: "APM data, alerts, and dashboards",
    category: "Infrastructure",
    emoji: "🔷",
    color: "bg-cyan-600/20 text-cyan-400",
    fields: [{ key: "NEWRELIC_API_KEY", label: "User API Key", placeholder: "NRAK-…", secret: true, helpUrl: "https://one.newrelic.com/api-keys" }],
    docsUrl: "https://docs.newrelic.com/docs/apis/rest-api-v2/",
  },
  {
    id: "betterstack",
    name: "Better Stack",
    description: "Uptime monitors, incidents, and on-call",
    category: "Infrastructure",
    emoji: "📈",
    color: "bg-slate-600/20 text-slate-300",
    fields: [{ key: "BETTERSTACK_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://uptime.betterstack.com/team/api-tokens" }],
    docsUrl: "https://betterstack.com/docs/uptime/api/getting-started-with-uptime-api/",
  },
  {
    id: "rollbar",
    name: "Rollbar",
    description: "Error tracking and deploy correlation",
    category: "Infrastructure",
    emoji: "🎯",
    color: "bg-red-500/20 text-red-400",
    fields: [{ key: "ROLLBAR_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true, helpUrl: "https://docs.rollbar.com/docs/api-tokens" }],
    docsUrl: "https://docs.rollbar.com/reference/getting-started-1",
  },

  // Search
  {
    id: "meilisearch",
    name: "Meilisearch",
    description: "Typo-tolerant search indexes",
    category: "Data",
    emoji: "🔎",
    color: "bg-pink-600/20 text-pink-400",
    fields: [
      { key: "MEILISEARCH_HOST", label: "Host", placeholder: "ms-abc.meilisearch.io", secret: false },
      { key: "MEILISEARCH_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://www.meilisearch.com/docs/learn/security/basic_security" },
    ],
    docsUrl: "https://www.meilisearch.com/docs/reference/api/overview",
  },
  {
    id: "typesense",
    name: "Typesense",
    description: "Fast open-source search",
    category: "Data",
    emoji: "🔠",
    color: "bg-indigo-500/20 text-indigo-400",
    fields: [
      { key: "TYPESENSE_HOST", label: "Host", placeholder: "xyz.a1.typesense.net", secret: false },
      { key: "TYPESENSE_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://cloud.typesense.org/" },
    ],
    docsUrl: "https://typesense.org/docs/latest/api/",
  },

  // AI providers, for the built app's own features
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models for your app's own AI features",
    category: "AI",
    emoji: "🅰️",
    color: "bg-orange-400/20 text-orange-300",
    fields: [{ key: "ANTHROPIC_API_KEY", label: "API Key", placeholder: "sk-ant-…", secret: true, helpUrl: "https://console.anthropic.com/settings/keys" }],
    docsUrl: "https://docs.claude.com/en/api/getting-started",
  },
  {
    id: "google_ai",
    name: "Google AI (Gemini)",
    description: "Gemini models via the Generative Language API",
    category: "AI",
    emoji: "✨",
    color: "bg-blue-500/20 text-blue-400",
    fields: [{ key: "GOOGLE_AI_API_KEY", label: "API Key", placeholder: "AIza…", secret: true, helpUrl: "https://aistudio.google.com/apikey" }],
    docsUrl: "https://ai.google.dev/api",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    description: "Open-weight and hosted Mistral models",
    category: "AI",
    emoji: "🌬️",
    color: "bg-amber-600/20 text-amber-400",
    fields: [{ key: "MISTRAL_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://console.mistral.ai/api-keys/" }],
    docsUrl: "https://docs.mistral.ai/api/",
  },
  {
    id: "cohere",
    name: "Cohere",
    description: "Embeddings, rerank, and chat models",
    category: "AI",
    emoji: "🧬",
    color: "bg-rose-500/20 text-rose-400",
    fields: [{ key: "COHERE_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://dashboard.cohere.com/api-keys" }],
    docsUrl: "https://docs.cohere.com/reference/about",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Very low latency open-model inference",
    category: "AI",
    emoji: "🚀",
    color: "bg-red-600/20 text-red-400",
    fields: [{ key: "GROQ_API_KEY", label: "API Key", placeholder: "gsk_…", secret: true, helpUrl: "https://console.groq.com/keys" }],
    docsUrl: "https://console.groq.com/docs/api-reference",
  },

  // Product analytics
  {
    id: "mixpanel",
    name: "Mixpanel",
    description: "Event analytics, funnels, and cohorts",
    category: "Data",
    emoji: "📊",
    color: "bg-purple-500/20 text-purple-400",
    fields: [{ key: "MIXPANEL_PROJECT_SECRET", label: "Project Secret", placeholder: "…", secret: true, helpUrl: "https://mixpanel.com/settings/project" }],
    docsUrl: "https://developer.mixpanel.com/reference/overview",
  },
  {
    id: "amplitude",
    name: "Amplitude",
    description: "Product analytics and behavioural cohorts",
    category: "Data",
    emoji: "📉",
    color: "bg-blue-400/20 text-blue-300",
    fields: [
      { key: "AMPLITUDE_API_KEY", label: "API Key", placeholder: "…", secret: false },
      { key: "AMPLITUDE_SECRET_KEY", label: "Secret Key", placeholder: "••••••••", secret: true, helpUrl: "https://app.amplitude.com/analytics/settings/projects" },
    ],
    docsUrl: "https://amplitude.com/docs/apis",
  },
  {
    id: "segment",
    name: "Segment",
    description: "Event pipeline to every downstream tool",
    category: "Data",
    emoji: "🔀",
    color: "bg-green-500/20 text-green-400",
    fields: [{ key: "SEGMENT_WRITE_KEY", label: "Write Key", placeholder: "…", secret: true, helpUrl: "https://segment.com/docs/connections/find-writekey/" }],
    docsUrl: "https://segment.com/docs/connections/sources/catalog/libraries/server/http-api/",
  },

  // Feature flags
  {
    id: "launchdarkly",
    name: "LaunchDarkly",
    description: "Feature flags, targeting, and experiments",
    category: "Infrastructure",
    emoji: "🚩",
    color: "bg-indigo-600/20 text-indigo-400",
    fields: [{ key: "LAUNCHDARKLY_ACCESS_TOKEN", label: "Access Token", placeholder: "api-…", secret: true, helpUrl: "https://app.launchdarkly.com/settings/authorization" }],
    docsUrl: "https://launchdarkly.com/docs/api",
  },
  {
    id: "statsig",
    name: "Statsig",
    description: "Feature gates, experiments, and metrics",
    category: "Infrastructure",
    emoji: "🧪",
    color: "bg-cyan-500/20 text-cyan-400",
    fields: [{ key: "STATSIG_CONSOLE_API_KEY", label: "Console API Key", placeholder: "console-…", secret: true, helpUrl: "https://console.statsig.com/api_keys" }],
    docsUrl: "https://docs.statsig.com/console-api/all-endpoints-generated",
  },

  // Video & streaming
  {
    id: "zoom",
    name: "Zoom",
    description: "Meetings, webinars, and recordings",
    category: "Communication",
    emoji: "🎥",
    color: "bg-blue-500/20 text-blue-400",
    fields: [{ key: "ZOOM_ACCESS_TOKEN", label: "Access Token", placeholder: "eyJ…", secret: true, helpUrl: "https://developers.zoom.us/docs/integrations/oauth/" }],
    docsUrl: "https://developers.zoom.us/docs/api/",
  },
  {
    id: "mux",
    name: "Mux",
    description: "Video upload, encoding, and playback data",
    category: "AI",
    emoji: "🎬",
    color: "bg-pink-500/20 text-pink-400",
    fields: [
      { key: "MUX_TOKEN_ID", label: "Token ID", placeholder: "…", secret: false },
      { key: "MUX_TOKEN_SECRET", label: "Token Secret", placeholder: "••••••••", secret: true, helpUrl: "https://dashboard.mux.com/settings/access-tokens" },
    ],
    docsUrl: "https://docs.mux.com/api-reference",
  },

  // ── ERP (2026-07-30: neither we nor Lovable covered these) ─────────────────
  {
    id: "netsuite",
    name: "Oracle NetSuite",
    description: "ERP records, transactions, and saved searches",
    category: "Data",
    emoji: "🏢",
    color: "bg-red-600/20 text-red-400",
    fields: [
      { key: "NETSUITE_ACCOUNT_ID", label: "Account ID", placeholder: "1234567 or 1234567_SB1", secret: false },
      { key: "NETSUITE_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true, helpUrl: "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_157771733782.html" },
    ],
    docsUrl: "https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1540391670.html",
  },
  {
    id: "sap",
    name: "SAP",
    description: "S/4HANA and OData services",
    category: "Data",
    emoji: "🧿",
    color: "bg-blue-600/20 text-blue-400",
    fields: [
      { key: "SAP_HOST", label: "API Host", placeholder: "my123456.s4hana.ondemand.com", secret: false },
      { key: "SAP_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true },
    ],
    docsUrl: "https://api.sap.com/",
  },
  {
    id: "dynamics365",
    name: "Dynamics 365 Business Central",
    description: "Customers, vendors, invoices, and ledger entries",
    category: "Data",
    emoji: "📊",
    color: "bg-sky-600/20 text-sky-400",
    fields: [
      { key: "DYNAMICS_TENANT_ID", label: "Tenant ID", placeholder: "uuid", secret: false },
      { key: "DYNAMICS_ENVIRONMENT", label: "Environment", placeholder: "production", secret: false },
      { key: "DYNAMICS_ACCESS_TOKEN", label: "Access Token", placeholder: "eyJ…", secret: true, helpUrl: "https://learn.microsoft.com/dynamics365/business-central/dev-itpro/api-reference/v2.0/" },
    ],
    docsUrl: "https://learn.microsoft.com/dynamics365/business-central/dev-itpro/api-reference/v2.0/",
  },
  {
    id: "odoo",
    name: "Odoo",
    description: "Open-source ERP and CRM over JSON-RPC",
    category: "Data",
    emoji: "🟣",
    color: "bg-purple-600/20 text-purple-400",
    fields: [
      { key: "ODOO_INSTANCE", label: "Instance URL", placeholder: "mycompany.odoo.com", secret: false },
      { key: "ODOO_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://www.odoo.com/documentation/master/developer/reference/external_api.html" },
    ],
    docsUrl: "https://www.odoo.com/documentation/master/developer/reference/external_api.html",
  },

  // ── Customer support ──────────────────────────────────────────────────────
  {
    id: "freshdesk",
    name: "Freshdesk",
    description: "Tickets, contacts, and agent activity",
    category: "Communication",
    emoji: "🎧",
    color: "bg-green-600/20 text-green-400",
    fields: [
      { key: "FRESHDESK_DOMAIN", label: "Domain", placeholder: "mycompany", secret: false },
      { key: "FRESHDESK_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://support.freshdesk.com/support/solutions/articles/215517" },
    ],
    docsUrl: "https://developers.freshdesk.com/api/",
  },
  {
    id: "front",
    name: "Front",
    description: "Shared inboxes, conversations, and comments",
    category: "Communication",
    emoji: "📬",
    color: "bg-indigo-600/20 text-indigo-400",
    fields: [{ key: "FRONT_API_TOKEN", label: "API Token", placeholder: "eyJ…", secret: true, helpUrl: "https://app.frontapp.com/settings/tools/api" }],
    docsUrl: "https://dev.frontapp.com/reference/introduction",
  },
  {
    id: "helpscout",
    name: "Help Scout",
    description: "Conversations, customers, and mailboxes",
    category: "Communication",
    emoji: "💙",
    color: "bg-blue-500/20 text-blue-400",
    fields: [{ key: "HELPSCOUT_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true, helpUrl: "https://developer.helpscout.com/mailbox-api/overview/authentication/" }],
    docsUrl: "https://developer.helpscout.com/mailbox-api/",
  },
  {
    id: "crisp",
    name: "Crisp",
    description: "Live chat conversations and visitor profiles",
    category: "Communication",
    emoji: "💬",
    color: "bg-teal-600/20 text-teal-400",
    fields: [
      { key: "CRISP_IDENTIFIER", label: "Plugin Identifier", placeholder: "uuid", secret: false },
      { key: "CRISP_KEY", label: "Plugin Key", placeholder: "…", secret: true, helpUrl: "https://marketplace.crisp.chat/" },
    ],
    docsUrl: "https://docs.crisp.chat/references/rest-api/v1/",
  },

  // ── Payroll / HR ──────────────────────────────────────────────────────────
  {
    id: "gusto",
    name: "Gusto",
    description: "Payroll, employees, and compensation",
    category: "Productivity",
    emoji: "💸",
    color: "bg-orange-500/20 text-orange-400",
    fields: [
      { key: "GUSTO_ACCESS_TOKEN", label: "Access Token", placeholder: "…", secret: true, helpUrl: "https://docs.gusto.com/app-integrations/docs/authentication" },
      { key: "GUSTO_ENV", label: "Environment", placeholder: "production or demo", secret: false },
    ],
    docsUrl: "https://docs.gusto.com/app-integrations/reference",
  },
  {
    id: "rippling",
    name: "Rippling",
    description: "Employees, groups, and employment records",
    category: "Productivity",
    emoji: "🌊",
    color: "bg-yellow-500/20 text-yellow-400",
    fields: [{ key: "RIPPLING_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://developer.rippling.com/documentation/rest-api/reference" }],
    docsUrl: "https://developer.rippling.com/documentation/rest-api",
  },
  {
    id: "bamboohr",
    name: "BambooHR",
    description: "Employee directory, time off, and reports",
    category: "Productivity",
    emoji: "🎍",
    color: "bg-lime-600/20 text-lime-400",
    fields: [
      { key: "BAMBOOHR_SUBDOMAIN", label: "Subdomain", placeholder: "mycompany", secret: false },
      { key: "BAMBOOHR_API_KEY", label: "API Key", placeholder: "…", secret: true, helpUrl: "https://documentation.bamboohr.com/docs/getting-started" },
    ],
    docsUrl: "https://documentation.bamboohr.com/reference",
  },
  {
    id: "deel",
    name: "Deel",
    description: "Global contracts, invoices, and workers",
    category: "Productivity",
    emoji: "🌍",
    color: "bg-violet-600/20 text-violet-400",
    fields: [{ key: "DEEL_API_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://developer.deel.com/docs/api-tokens" }],
    docsUrl: "https://developer.deel.com/reference",
  },

  {
    // App-level Wiz access. Distinct from the platform scan vendor in
    // /api/security/scan, which uses the workspace's own WIZ_CLIENT_ID/SECRET —
    // this lets a built app query Wiz through the gateway with its own token.
    id: "wiz",
    name: "Wiz",
    description: "Cloud security findings and vulnerability data (GraphQL)",
    category: "Infrastructure",
    emoji: "🛡️",
    color: "bg-indigo-500/20 text-indigo-400",
    fields: [
      { key: "WIZ_API_ENDPOINT", label: "API Endpoint", placeholder: "api.us1.app.wiz.io", secret: false },
      { key: "WIZ_ACCESS_TOKEN", label: "Access Token", placeholder: "eyJ…", secret: true, helpUrl: "https://win.wiz.io/docs/service-accounts" },
    ],
    docsUrl: "https://win.wiz.io/reference/quickstart",
  },
  {
    id: "gatewayapi",
    name: "GatewayAPI",
    description: "European SMS delivery",
    category: "Communication",
    emoji: "📨",
    color: "bg-emerald-500/20 text-emerald-400",
    fields: [{ key: "GATEWAYAPI_TOKEN", label: "API Token", placeholder: "…", secret: true, helpUrl: "https://gatewayapi.com/app/settings/api" }],
    docsUrl: "https://gatewayapi.com/docs/apis/rest/",
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
              <p className="text-[10px] text-sky-700 dark:text-sky-300">OAuth is available — paste your credentials below or use the OAuth flow in production.</p>
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
  const { toast } = useToast();
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
    // SEQUENTIAL, and checked.
    //
    // `Promise.all` fired every field at once, and each request is a
    // read-modify-write of the same .env.local row — so they all read the
    // pre-write content and the last one won. A three-field connector
    // persisted exactly one key while this function unconditionally marked it
    // Connected; on the next mount the panel's own completeness check found
    // the other keys missing and flipped the tile back with no explanation.
    // (The server serializes these now too, but doing them in order here is
    // what makes a failure reportable per field.)
    const failed: string[] = [];
    for (const [key, value] of Object.entries(values)) {
      try {
        const res = await fetch(`/api/projects/${projectId}/env`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        if (!res.ok) failed.push(key);
      } catch {
        failed.push(key);
      }
    }
    if (failed.length > 0) {
      toast({
        title: "Connection not saved",
        description: `${failed.join(", ")} could not be stored, so this is not connected yet. Check that you are still signed in, then try again.`,
        variant: "destructive",
      });
      return;
    }
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
