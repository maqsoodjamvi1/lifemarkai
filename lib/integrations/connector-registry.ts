/**
 * Connector gateway registry — Lovable-parity "connector gateway".
 *
 * Each entry maps a connector id (as listed in app-connectors-panel.tsx) to
 * its API base URL and the auth headers built from the project's env vars
 * (stored in the project's .env file via /api/projects/[id]/env).
 *
 * The gateway (/api/projects/[id]/connector-proxy) only ever forwards to the
 * connector's own base URL — never to arbitrary hosts — and injects the
 * secret server-side so deployed apps never ship credentials to the browser.
 */

export interface ConnectorSpec {
  /** API base URL — forwarded paths are appended to this */
  baseUrl: string | ((env: Record<string, string>) => string);
  /** Env keys that must be present for the connector to work */
  requiredEnv: string[];
  /** Build auth/extra headers from env */
  headers: (env: Record<string, string>) => Record<string, string>;
}

function basic(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

export const CONNECTOR_REGISTRY: Record<string, ConnectorSpec> = {
  slack: {
    baseUrl: "https://slack.com/api",
    requiredEnv: ["SLACK_BOT_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` }),
  },
  resend: {
    baseUrl: "https://api.resend.com",
    requiredEnv: ["RESEND_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.RESEND_API_KEY}` }),
  },
  notion: {
    baseUrl: "https://api.notion.com/v1",
    requiredEnv: ["NOTION_API_KEY"],
    headers: (env) => ({
      Authorization: `Bearer ${env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
    }),
  },
  hubspot: {
    baseUrl: "https://api.hubapi.com",
    requiredEnv: ["HUBSPOT_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.HUBSPOT_ACCESS_TOKEN}` }),
  },
  linear: {
    baseUrl: "https://api.linear.app",
    requiredEnv: ["LINEAR_API_KEY"],
    headers: (env) => ({ Authorization: env.LINEAR_API_KEY }),
  },
  asana: {
    baseUrl: "https://app.asana.com/api/1.0",
    requiredEnv: ["ASANA_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.ASANA_ACCESS_TOKEN}` }),
  },
  elevenlabs: {
    baseUrl: "https://api.elevenlabs.io",
    requiredEnv: ["ELEVENLABS_API_KEY"],
    headers: (env) => ({ "xi-api-key": env.ELEVENLABS_API_KEY }),
  },
  firecrawl: {
    baseUrl: "https://api.firecrawl.dev",
    requiredEnv: ["FIRECRAWL_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.FIRECRAWL_API_KEY}` }),
  },
  perplexity: {
    baseUrl: "https://api.perplexity.ai",
    requiredEnv: ["PERPLEXITY_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.PERPLEXITY_API_KEY}` }),
  },
  airtable: {
    baseUrl: "https://api.airtable.com",
    requiredEnv: ["AIRTABLE_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.AIRTABLE_API_KEY}` }),
  },
  twilio: {
    baseUrl: "https://api.twilio.com",
    requiredEnv: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    headers: (env) => ({ Authorization: basic(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN) }),
  },
  mailgun: {
    baseUrl: "https://api.mailgun.net",
    requiredEnv: ["MAILGUN_API_KEY"],
    headers: (env) => ({ Authorization: basic("api", env.MAILGUN_API_KEY) }),
  },
  telegram: {
    baseUrl: (env) => `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`,
    requiredEnv: ["TELEGRAM_BOT_TOKEN"],
    headers: () => ({}),
  },
  stripe: {
    baseUrl: "https://api.stripe.com",
    requiredEnv: ["STRIPE_SECRET_KEY"],
    headers: (env) => ({
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    }),
  },
  openai: {
    baseUrl: "https://api.openai.com",
    requiredEnv: ["OPENAI_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.OPENAI_API_KEY}` }),
  },
  shopify: {
    baseUrl: (env) =>
      `https://${env.SHOPIFY_SHOP_NAME.replace(/\.myshopify\.com$/i, "")}.myshopify.com/admin/api/2024-10`,
    requiredEnv: ["SHOPIFY_SHOP_NAME", "SHOPIFY_ACCESS_TOKEN"],
    headers: (env) => ({ "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN }),
  },
  github: {
    baseUrl: "https://api.github.com",
    requiredEnv: ["GITHUB_ACCESS_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.GITHUB_ACCESS_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    }),
  },
  google_calendar: {
    baseUrl: "https://www.googleapis.com/calendar/v3",
    requiredEnv: ["GOOGLE_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.GOOGLE_ACCESS_TOKEN}` }),
  },
  google_sheets: {
    baseUrl: "https://sheets.googleapis.com/v4",
    requiredEnv: ["GOOGLE_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.GOOGLE_ACCESS_TOKEN}` }),
  },
  google_workspace: {
    baseUrl: "https://www.googleapis.com",
    requiredEnv: ["GOOGLE_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.GOOGLE_ACCESS_TOKEN}` }),
  },
  brevo: {
    baseUrl: "https://api.brevo.com/v3",
    requiredEnv: ["BREVO_API_KEY"],
    headers: (env) => ({ "api-key": env.BREVO_API_KEY }),
  },
  contentful: {
    baseUrl: (env) => `https://cdn.contentful.com/spaces/${env.CONTENTFUL_SPACE_ID}`,
    requiredEnv: ["CONTENTFUL_SPACE_ID", "CONTENTFUL_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.CONTENTFUL_ACCESS_TOKEN}` }),
  },
  inngest: {
    baseUrl: "https://api.inngest.com",
    requiredEnv: ["INNGEST_SIGNING_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.INNGEST_SIGNING_KEY}` }),
  },
  wordpress: {
    baseUrl: (env) =>
      `https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(env.WORDPRESS_SITE)}`,
    requiredEnv: ["WORDPRESS_SITE", "WORDPRESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.WORDPRESS_TOKEN}` }),
  },
  fireflies: {
    baseUrl: "https://api.fireflies.ai",
    requiredEnv: ["FIREFLIES_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.FIREFLIES_API_KEY}` }),
  },
  databricks: {
    baseUrl: (env) => `https://${env.DATABRICKS_HOST.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["DATABRICKS_HOST", "DATABRICKS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.DATABRICKS_TOKEN}` }),
  },
  ashby: {
    baseUrl: "https://api.ashbyhq.com",
    requiredEnv: ["ASHBY_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.ASHBY_API_KEY}` }),
  },
  attention: {
    baseUrl: "https://api.attention.tech",
    requiredEnv: ["ATTENTION_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.ATTENTION_API_KEY}` }),
  },
  microsoft_365: {
    baseUrl: "https://graph.microsoft.com/v1.0",
    requiredEnv: ["MS_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.MS_ACCESS_TOKEN}` }),
  },
  storyblok: {
    baseUrl: (env) => `https://api.storyblok.com/v2/cdn/stories`,
    requiredEnv: ["STORYBLOK_ACCESS_TOKEN"],
    headers: () => ({}),
  },
  google_maps: {
    baseUrl: "https://maps.googleapis.com/maps/api",
    requiredEnv: ["GOOGLE_MAPS_API_KEY"],
    headers: () => ({}),
  },
};

export function resolveConnectorBaseUrl(spec: ConnectorSpec, env: Record<string, string>): string {
  return typeof spec.baseUrl === "function" ? spec.baseUrl(env) : spec.baseUrl;
}
