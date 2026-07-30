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
  snowflake: {
    // Account-scoped SQL API, e.g. https://<account>.snowflakecomputing.com
    // Normalised like the Databricks entry: a user who pastes the bare host
    // (no scheme) previously produced a schemeless base URL, which meant the
    // gateway's own https-only forwarding rejected it — a config error that
    // surfaced as an opaque connector failure.
    baseUrl: (env) =>
      `https://${env.SNOWFLAKE_ACCOUNT_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["SNOWFLAKE_ACCOUNT_URL", "SNOWFLAKE_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.SNOWFLAKE_TOKEN}`,
      "X-Snowflake-Authorization-Token-Type": "OAUTH",
    }),
  },
  bigquery: {
    baseUrl: "https://bigquery.googleapis.com/bigquery/v2",
    requiredEnv: ["GOOGLE_OAUTH_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.GOOGLE_OAUTH_TOKEN}` }),
  },
  salesforce: {
    // Instance-scoped REST API, e.g. https://mydomain.my.salesforce.com
    // Scheme-normalised for the same reason as Snowflake above.
    baseUrl: (env) =>
      `https://${env.SALESFORCE_INSTANCE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["SALESFORCE_INSTANCE_URL", "SALESFORCE_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.SALESFORCE_ACCESS_TOKEN}` }),
  },
  algolia: {
    baseUrl: (env) => `https://${env.ALGOLIA_APP_ID}.algolia.net`,
    requiredEnv: ["ALGOLIA_APP_ID", "ALGOLIA_API_KEY"],
    headers: (env) => ({
      "X-Algolia-Application-Id": env.ALGOLIA_APP_ID,
      "X-Algolia-API-Key": env.ALGOLIA_API_KEY,
    }),
  },
  sentry: {
    baseUrl: "https://sentry.io/api/0",
    requiredEnv: ["SENTRY_AUTH_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.SENTRY_AUTH_TOKEN}` }),
  },
  posthog: {
    // Self-hosted / EU instances override via POSTHOG_HOST
    baseUrl: (env) => (env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, ""),
    requiredEnv: ["POSTHOG_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.POSTHOG_API_KEY}` }),
  },
  semrush: {
    // SEMrush authenticates with a `key` query parameter, not headers.
    // The proxy only injects headers, so we pass the key as X-Api-Key too;
    // generated apps should still append `?key=` (via body.query) for the
    // classic analytics endpoints that ignore headers.
    baseUrl: "https://api.semrush.com",
    requiredEnv: ["SEMRUSH_API_KEY"],
    headers: (env) => ({ "X-Api-Key": env.SEMRUSH_API_KEY }),
  },
  linkedin: {
    baseUrl: "https://api.linkedin.com/v2",
    requiredEnv: ["LINKEDIN_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}` }),
  },
  tiktok: {
    baseUrl: "https://open.tiktokapis.com/v2",
    requiredEnv: ["TIKTOK_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}` }),
  },
  twitch: {
    baseUrl: "https://api.twitch.tv/helix",
    requiredEnv: ["TWITCH_ACCESS_TOKEN", "TWITCH_CLIENT_ID"],
    headers: (env) => ({
      Authorization: `Bearer ${env.TWITCH_ACCESS_TOKEN}`,
      "Client-Id": env.TWITCH_CLIENT_ID,
    }),
  },
  granola: {
    baseUrl: "https://api.granola.ai/v1",
    requiredEnv: ["GRANOLA_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.GRANOLA_API_KEY}` }),
  },
  gitlab: {
    baseUrl: "https://gitlab.com/api/v4",
    requiredEnv: ["GITLAB_TOKEN"],
    headers: (env) => ({ "PRIVATE-TOKEN": env.GITLAB_TOKEN }),
  },
  google_search_console: {
    baseUrl: "https://searchconsole.googleapis.com",
    requiredEnv: ["GOOGLE_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.GOOGLE_ACCESS_TOKEN}` }),
  },
  gemini_enterprise: {
    baseUrl: "https://discoveryengine.googleapis.com/v1",
    requiredEnv: ["GOOGLE_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.GOOGLE_ACCESS_TOKEN}` }),
  },
  aikido: {
    baseUrl: "https://app.aikido.dev/api",
    requiredEnv: ["AIKIDO_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.AIKIDO_API_KEY}` }),
  },
  discord: {
    baseUrl: "https://discord.com/api/v10",
    requiredEnv: ["DISCORD_BOT_TOKEN"],
    headers: (env) => ({ Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }),
  },
  jira: {
    // Cloud instance, e.g. https://mycompany.atlassian.net
    baseUrl: (env) => `https://${env.JIRA_DOMAIN.replace(/\.atlassian\.net$/i, "")}.atlassian.net`,
    requiredEnv: ["JIRA_DOMAIN", "JIRA_EMAIL", "JIRA_API_TOKEN"],
    headers: (env) => ({ Authorization: basic(env.JIRA_EMAIL, env.JIRA_API_TOKEN), Accept: "application/json" }),
  },
  zendesk: {
    baseUrl: (env) => `https://${env.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`,
    requiredEnv: ["ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL", "ZENDESK_API_TOKEN"],
    headers: (env) => ({ Authorization: basic(`${env.ZENDESK_EMAIL}/token`, env.ZENDESK_API_TOKEN) }),
  },
  intercom: {
    baseUrl: "https://api.intercom.io",
    requiredEnv: ["INTERCOM_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.INTERCOM_ACCESS_TOKEN}`, Accept: "application/json" }),
  },
  calendly: {
    baseUrl: "https://api.calendly.com",
    requiredEnv: ["CALENDLY_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.CALENDLY_TOKEN}` }),
  },
  sendgrid: {
    baseUrl: "https://api.sendgrid.com/v3",
    requiredEnv: ["SENDGRID_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.SENDGRID_API_KEY}` }),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Batch added 2026-07-30 to close the connector gap against Lovable
  // (52 → 82). Grouped by theme; the gaps were concentrated in warehouse/BI,
  // commerce, and EU accounting.
  //
  // Every host below is the vendor's documented API origin and every auth scheme
  // is the vendor's documented one. Connectors whose host is per-tenant take the
  // function form of `baseUrl` and normalise what the user pasted (strip scheme,
  // strip trailing slash) — the Shopify and Databricks entries above set that
  // precedent, and skipping it is how you get a double-scheme URL that fails
  // only for the users who pasted the full URL.
  //
  // NOTE ON SQL-OVER-HTTP CONNECTORS. Redshift, Athena and Fabric are reached
  // through AWS/Azure request-signed APIs (SigV4 / Entra bearer). The gateway
  // injects static headers only — it cannot compute a SigV4 signature per
  // request — so those three take a pre-issued bearer/session token supplied by
  // the app owner rather than raw access keys. If a project needs full SigV4,
  // that belongs in an edge function, not here.
  // ───────────────────────────────────────────────────────────────────────────

  // ── Warehouse / BI ────────────────────────────────────────────────────────
  redshift: {
    // Redshift Data API. Region-scoped host; token is a pre-issued session token.
    baseUrl: (env) => `https://redshift-data.${env.REDSHIFT_REGION}.amazonaws.com`,
    requiredEnv: ["REDSHIFT_REGION", "REDSHIFT_SESSION_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.REDSHIFT_SESSION_TOKEN}`,
      "Content-Type": "application/x-amz-json-1.1",
    }),
  },
  athena: {
    baseUrl: (env) => `https://athena.${env.ATHENA_REGION}.amazonaws.com`,
    requiredEnv: ["ATHENA_REGION", "ATHENA_SESSION_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.ATHENA_SESSION_TOKEN}`,
      "Content-Type": "application/x-amz-json-1.1",
    }),
  },
  microsoft_fabric: {
    // Fabric GraphQL / REST over the Power BI API surface. Entra bearer token.
    baseUrl: "https://api.fabric.microsoft.com/v1",
    requiredEnv: ["FABRIC_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.FABRIC_ACCESS_TOKEN}` }),
  },
  clickhouse: {
    // ClickHouse Cloud speaks SQL over plain HTTPS with basic auth.
    baseUrl: (env) =>
      `https://${env.CLICKHOUSE_HOST.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["CLICKHOUSE_HOST", "CLICKHOUSE_USER", "CLICKHOUSE_PASSWORD"],
    headers: (env) => ({
      Authorization: basic(env.CLICKHOUSE_USER, env.CLICKHOUSE_PASSWORD),
    }),
  },
  dbt: {
    // dbt Semantic Layer — read-only governed metrics.
    baseUrl: (env) =>
      `https://${(env.DBT_HOST || "semantic-layer.cloud.getdbt.com").replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["DBT_SERVICE_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.DBT_SERVICE_TOKEN}` }),
  },

  // ── Commerce ──────────────────────────────────────────────────────────────
  woocommerce: {
    // WooCommerce REST v3 — consumer key/secret over basic auth on the store host.
    baseUrl: (env) =>
      `https://${env.WOOCOMMERCE_STORE.replace(/^https?:\/\//, "").replace(/\/$/, "")}/wp-json/wc/v3`,
    requiredEnv: ["WOOCOMMERCE_STORE", "WOOCOMMERCE_KEY", "WOOCOMMERCE_SECRET"],
    headers: (env) => ({ Authorization: basic(env.WOOCOMMERCE_KEY, env.WOOCOMMERCE_SECRET) }),
  },
  prestashop: {
    // PrestaShop webservice: API key as the basic-auth USERNAME, blank password.
    baseUrl: (env) =>
      `https://${env.PRESTASHOP_STORE.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api`,
    requiredEnv: ["PRESTASHOP_STORE", "PRESTASHOP_API_KEY"],
    headers: (env) => ({
      Authorization: basic(env.PRESTASHOP_API_KEY, ""),
      Accept: "application/json",
    }),
  },
  wix: {
    baseUrl: "https://www.wixapis.com",
    requiredEnv: ["WIX_API_KEY", "WIX_SITE_ID"],
    headers: (env) => ({
      Authorization: env.WIX_API_KEY,
      "wix-site-id": env.WIX_SITE_ID,
    }),
  },
  lightspeed: {
    baseUrl: "https://api.lightspeedapp.com/API/V3",
    requiredEnv: ["LIGHTSPEED_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.LIGHTSPEED_ACCESS_TOKEN}` }),
  },
  paddle: {
    // Sandbox and live are different hosts, so let the owner point at either.
    baseUrl: (env) =>
      env.PADDLE_ENV === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com",
    requiredEnv: ["PADDLE_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.PADDLE_API_KEY}` }),
  },
  chargebee: {
    baseUrl: (env) => `https://${env.CHARGEBEE_SITE}.chargebee.com/api/v2`,
    requiredEnv: ["CHARGEBEE_SITE", "CHARGEBEE_API_KEY"],
    headers: (env) => ({ Authorization: basic(env.CHARGEBEE_API_KEY, "") }),
  },

  // ── Accounting (EU-heavy, which is where the gap was widest) ──────────────
  xero: {
    baseUrl: "https://api.xero.com/api.xro/2.0",
    requiredEnv: ["XERO_ACCESS_TOKEN", "XERO_TENANT_ID"],
    headers: (env) => ({
      Authorization: `Bearer ${env.XERO_ACCESS_TOKEN}`,
      "Xero-Tenant-Id": env.XERO_TENANT_ID,
      Accept: "application/json",
    }),
  },
  lexware: {
    baseUrl: "https://api.lexware.io/v1",
    requiredEnv: ["LEXWARE_API_KEY"],
    headers: (env) => ({
      Authorization: `Bearer ${env.LEXWARE_API_KEY}`,
      Accept: "application/json",
    }),
  },
  sevdesk: {
    baseUrl: "https://my.sevdesk.de/api/v1",
    requiredEnv: ["SEVDESK_API_TOKEN"],
    headers: (env) => ({ Authorization: env.SEVDESK_API_TOKEN }),
  },
  wave: {
    // Wave is GraphQL-only.
    baseUrl: "https://gql.waveapps.com/graphql/public",
    requiredEnv: ["WAVE_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.WAVE_ACCESS_TOKEN}` }),
  },
  zoho_books: {
    // Zoho is DC-partitioned (.com/.eu/.in/.com.au) — wrong DC returns 401.
    baseUrl: (env) => `https://www.zohoapis.${env.ZOHO_DC || "com"}/books/v3`,
    requiredEnv: ["ZOHO_OAUTH_TOKEN"],
    headers: (env) => ({ Authorization: `Zoho-oauthtoken ${env.ZOHO_OAUTH_TOKEN}` }),
  },
  zoho_crm: {
    baseUrl: (env) => `https://www.zohoapis.${env.ZOHO_DC || "com"}/crm/v6`,
    requiredEnv: ["ZOHO_OAUTH_TOKEN"],
    headers: (env) => ({ Authorization: `Zoho-oauthtoken ${env.ZOHO_OAUTH_TOKEN}` }),
  },

  // ── Growth / data ─────────────────────────────────────────────────────────
  google_analytics: {
    // GA4 Data API (runReport etc.).
    baseUrl: "https://analyticsdata.googleapis.com/v1beta",
    requiredEnv: ["GOOGLE_ANALYTICS_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.GOOGLE_ANALYTICS_ACCESS_TOKEN}` }),
  },
  apollo: {
    // Apollo.io uses a bare header, not a bearer.
    baseUrl: "https://api.apollo.io/api/v1",
    requiredEnv: ["APOLLO_API_KEY"],
    headers: (env) => ({ "x-api-key": env.APOLLO_API_KEY, Accept: "application/json" }),
  },
  apify: {
    baseUrl: "https://api.apify.com/v2",
    requiredEnv: ["APIFY_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.APIFY_TOKEN}` }),
  },
  tally: {
    baseUrl: "https://api.tally.so",
    requiredEnv: ["TALLY_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.TALLY_API_KEY}` }),
  },
  pipedrive: {
    baseUrl: (env) => `https://${env.PIPEDRIVE_DOMAIN}.pipedrive.com/api/v2`,
    requiredEnv: ["PIPEDRIVE_DOMAIN", "PIPEDRIVE_API_TOKEN"],
    headers: (env) => ({ "x-api-token": env.PIPEDRIVE_API_TOKEN }),
  },
  logodev: {
    baseUrl: "https://api.logo.dev",
    requiredEnv: ["LOGODEV_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.LOGODEV_API_KEY}` }),
  },
  klipy: {
    baseUrl: "https://api.klipy.com/api/v1",
    requiredEnv: ["KLIPY_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.KLIPY_API_KEY}` }),
  },
  mapbox: {
    // Mapbox authenticates by query token, not header. The proxy forwards the
    // caller's path+query verbatim, so the app appends ?access_token=… itself;
    // this entry exists to allowlist the host and keep the key server-side for
    // the calls that do accept a header.
    baseUrl: "https://api.mapbox.com",
    requiredEnv: ["MAPBOX_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.MAPBOX_ACCESS_TOKEN}` }),
  },

  // ── Content / media / misc ────────────────────────────────────────────────
  sharepoint: {
    // SharePoint lists/sites live behind Microsoft Graph.
    baseUrl: "https://graph.microsoft.com/v1.0",
    requiredEnv: ["SHAREPOINT_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.SHAREPOINT_ACCESS_TOKEN}` }),
  },
  heygen: {
    baseUrl: "https://api.heygen.com",
    requiredEnv: ["HEYGEN_API_KEY"],
    headers: (env) => ({ "X-Api-Key": env.HEYGEN_API_KEY }),
  },
  replicate: {
    baseUrl: "https://api.replicate.com/v1",
    requiredEnv: ["REPLICATE_API_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.REPLICATE_API_TOKEN}` }),
  },
  x: {
    // X/Twitter API v2.
    baseUrl: "https://api.x.com/2",
    requiredEnv: ["X_BEARER_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.X_BEARER_TOKEN}` }),
  },
  gatewayapi: {
    // GatewayAPI (EU SMS): token as basic-auth username, blank password.
    baseUrl: "https://gatewayapi.eu/rest",
    requiredEnv: ["GATEWAYAPI_TOKEN"],
    headers: (env) => ({ Authorization: basic(env.GATEWAYAPI_TOKEN, "") }),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Batch added 2026-07-30 (84 → 96): three categories NEITHER we nor Lovable
  // covered — ERP, customer support, and payroll/HR. Not count-padding: these are
  // the systems a business app has to talk to that were simply absent from both
  // products, so they are net-new capability rather than catching up.
  //
  // Where a vendor's URL layout is tenant-specific AND its service path varies by
  // module (SAP, Odoo), baseUrl is the host root only. The gateway appends the
  // caller's path, so the app supplies the service path itself — asserting one here
  // would be guessing at a layout that differs per deployment.
  // ───────────────────────────────────────────────────────────────────────────

  // ── ERP ───────────────────────────────────────────────────────────────────
  netsuite: {
    // SuiteTalk REST is account-scoped. Account ids contain underscores for
    // sandboxes (1234567_SB1) and the host wants them lowercased with a hyphen.
    baseUrl: (env) =>
      `https://${env.NETSUITE_ACCOUNT_ID.toLowerCase().replace(/_/g, "-")}.suitetalk.api.netsuite.com/services/rest`,
    requiredEnv: ["NETSUITE_ACCOUNT_ID", "NETSUITE_ACCESS_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.NETSUITE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    }),
  },
  sap: {
    // S/4HANA Cloud and on-prem gateways differ in path layout; host root only.
    baseUrl: (env) =>
      `https://${env.SAP_HOST.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["SAP_HOST", "SAP_ACCESS_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.SAP_ACCESS_TOKEN}`,
      Accept: "application/json",
    }),
  },
  dynamics365: {
    // Business Central. Tenant + environment are both part of the path.
    baseUrl: (env) =>
      `https://api.businesscentral.dynamics.com/v2.0/${env.DYNAMICS_TENANT_ID}/${env.DYNAMICS_ENVIRONMENT}/api/v2.0`,
    requiredEnv: ["DYNAMICS_TENANT_ID", "DYNAMICS_ENVIRONMENT", "DYNAMICS_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.DYNAMICS_ACCESS_TOKEN}` }),
  },
  odoo: {
    // Odoo speaks JSON-RPC at /jsonrpc on the instance; host root only so the app
    // can also reach /web/session or a custom controller.
    baseUrl: (env) =>
      `https://${env.ODOO_INSTANCE.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["ODOO_INSTANCE", "ODOO_API_KEY"],
    headers: (env) => ({
      Authorization: `Bearer ${env.ODOO_API_KEY}`,
      "Content-Type": "application/json",
    }),
  },

  // ── Customer support ──────────────────────────────────────────────────────
  freshdesk: {
    // API key as the basic-auth USERNAME with a literal "X" password.
    baseUrl: (env) =>
      `https://${env.FRESHDESK_DOMAIN.replace(/\.freshdesk\.com$/i, "")}.freshdesk.com/api/v2`,
    requiredEnv: ["FRESHDESK_DOMAIN", "FRESHDESK_API_KEY"],
    headers: (env) => ({ Authorization: basic(env.FRESHDESK_API_KEY, "X") }),
  },
  front: {
    baseUrl: "https://api2.frontapp.com",
    requiredEnv: ["FRONT_API_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.FRONT_API_TOKEN}`,
      Accept: "application/json",
    }),
  },
  helpscout: {
    baseUrl: "https://api.helpscout.net/v2",
    requiredEnv: ["HELPSCOUT_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.HELPSCOUT_ACCESS_TOKEN}` }),
  },
  crisp: {
    // Crisp needs BOTH basic auth and a tier header; omitting the tier returns 401
    // with a misleading "invalid credentials".
    baseUrl: "https://api.crisp.chat/v1",
    requiredEnv: ["CRISP_IDENTIFIER", "CRISP_KEY"],
    headers: (env) => ({
      Authorization: basic(env.CRISP_IDENTIFIER, env.CRISP_KEY),
      "X-Crisp-Tier": "plugin",
    }),
  },

  // ── Payroll / HR ──────────────────────────────────────────────────────────
  gusto: {
    // Demo and production are different hosts; sending demo tokens to production
    // fails in a way that looks like a permissions problem.
    baseUrl: (env) =>
      env.GUSTO_ENV === "demo"
        ? "https://api.gusto-demo.com/v1"
        : "https://api.gusto.com/v1",
    requiredEnv: ["GUSTO_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.GUSTO_ACCESS_TOKEN}` }),
  },
  rippling: {
    baseUrl: "https://api.rippling.com/platform/api",
    requiredEnv: ["RIPPLING_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.RIPPLING_API_KEY}` }),
  },
  bamboohr: {
    // Subdomain-scoped gateway; API key as basic-auth username, "x" password.
    baseUrl: (env) =>
      `https://api.bamboohr.com/api/gateway.php/${env.BAMBOOHR_SUBDOMAIN}/v1`,
    requiredEnv: ["BAMBOOHR_SUBDOMAIN", "BAMBOOHR_API_KEY"],
    headers: (env) => ({
      Authorization: basic(env.BAMBOOHR_API_KEY, "x"),
      Accept: "application/json",
    }),
  },
  deel: {
    baseUrl: "https://api.letsdeel.com/rest/v2",
    requiredEnv: ["DEEL_API_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.DEEL_API_TOKEN}` }),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Batch added 2026-07-30 (96 → 136). Eleven categories, chosen because they are
  // what a generated app actually needs to call and neither product covered them.
  //
  // Two constraints shaped every entry, both from the gateway's design:
  //   1. It injects STATIC HEADERS. A vendor that authenticates in the request BODY
  //      (Plaid) or only by query string (Trello, OpenWeather) cannot be served by
  //      header injection, so those are deliberately absent rather than added as
  //      entries that would silently fail.
  //   2. Region- and tenant-scoped hosts take the function form and normalise what
  //      the user pasted, per the Shopify/Databricks precedent.
  //
  // Auth follows each vendor's documented scheme. They differ more than is
  // comfortable — raw tokens with no scheme, custom header names, basic auth with a
  // throwaway half, mandatory version pins — and getting one wrong produces a 401
  // that reads like bad credentials.
  // ───────────────────────────────────────────────────────────────────────────

  // ── Payments ──────────────────────────────────────────────────────────────
  paypal: {
    baseUrl: (env) =>
      env.PAYPAL_ENV === "sandbox"
        ? "https://api-m.sandbox.paypal.com"
        : "https://api-m.paypal.com",
    requiredEnv: ["PAYPAL_ACCESS_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.PAYPAL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    }),
  },
  square: {
    // Square REQUIRES a Square-Version pin; without it the API rejects the request.
    baseUrl: (env) =>
      env.SQUARE_ENV === "sandbox"
        ? "https://connect.squareupsandbox.com/v2"
        : "https://connect.squareup.com/v2",
    requiredEnv: ["SQUARE_ACCESS_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": "2025-01-23",
    }),
  },
  adyen: {
    baseUrl: (env) =>
      env.ADYEN_ENV === "live"
        ? "https://checkout-live.adyen.com/v71"
        : "https://checkout-test.adyen.com/v71",
    requiredEnv: ["ADYEN_API_KEY"],
    headers: (env) => ({ "X-API-Key": env.ADYEN_API_KEY, "Content-Type": "application/json" }),
  },
  razorpay: {
    baseUrl: "https://api.razorpay.com/v1",
    requiredEnv: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
    headers: (env) => ({ Authorization: basic(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET) }),
  },
  mollie: {
    baseUrl: "https://api.mollie.com/v2",
    requiredEnv: ["MOLLIE_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.MOLLIE_API_KEY}` }),
  },
  coinbase_commerce: {
    // Custom header names, and the version header is mandatory.
    baseUrl: "https://api.commerce.coinbase.com",
    requiredEnv: ["COINBASE_COMMERCE_API_KEY"],
    headers: (env) => ({
      "X-CC-Api-Key": env.COINBASE_COMMERCE_API_KEY,
      "X-CC-Version": "2018-03-22",
    }),
  },

  // ── Email & marketing ─────────────────────────────────────────────────────
  mailchimp: {
    // Datacentre suffix is part of the host and is the tail of the API key.
    baseUrl: (env) => `https://${env.MAILCHIMP_DC}.api.mailchimp.com/3.0`,
    requiredEnv: ["MAILCHIMP_DC", "MAILCHIMP_API_KEY"],
    headers: (env) => ({ Authorization: basic("anystring", env.MAILCHIMP_API_KEY) }),
  },
  postmark: {
    baseUrl: "https://api.postmarkapp.com",
    requiredEnv: ["POSTMARK_SERVER_TOKEN"],
    headers: (env) => ({
      "X-Postmark-Server-Token": env.POSTMARK_SERVER_TOKEN,
      Accept: "application/json",
    }),
  },
  klaviyo: {
    // Non-standard scheme keyword, plus a required revision date.
    baseUrl: "https://a.klaviyo.com/api",
    requiredEnv: ["KLAVIYO_API_KEY"],
    headers: (env) => ({
      Authorization: `Klaviyo-API-Key ${env.KLAVIYO_API_KEY}`,
      revision: "2024-10-15",
    }),
  },
  customerio: {
    baseUrl: "https://api.customer.io/v1",
    requiredEnv: ["CUSTOMERIO_APP_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.CUSTOMERIO_APP_API_KEY}` }),
  },
  loops: {
    baseUrl: "https://app.loops.so/api/v1",
    requiredEnv: ["LOOPS_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.LOOPS_API_KEY}` }),
  },

  // ── Storage & CDN ─────────────────────────────────────────────────────────
  cloudflare: {
    baseUrl: "https://api.cloudflare.com/client/v4",
    requiredEnv: ["CLOUDFLARE_API_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }),
  },
  cloudinary: {
    baseUrl: (env) => `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}`,
    requiredEnv: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
    headers: (env) => ({ Authorization: basic(env.CLOUDINARY_API_KEY, env.CLOUDINARY_API_SECRET) }),
  },
  uploadcare: {
    // Uploadcare wants its own scheme keyword and an Accept that pins the version.
    baseUrl: "https://api.uploadcare.com",
    requiredEnv: ["UPLOADCARE_PUBLIC_KEY", "UPLOADCARE_SECRET_KEY"],
    headers: (env) => ({
      Authorization: `Uploadcare.Simple ${env.UPLOADCARE_PUBLIC_KEY}:${env.UPLOADCARE_SECRET_KEY}`,
      Accept: "application/vnd.uploadcare-v0.7+json",
    }),
  },
  bunny: {
    baseUrl: "https://api.bunny.net",
    requiredEnv: ["BUNNY_API_KEY"],
    headers: (env) => ({ AccessKey: env.BUNNY_API_KEY, Accept: "application/json" }),
  },

  // ── Auth & identity ───────────────────────────────────────────────────────
  auth0: {
    baseUrl: (env) =>
      `https://${env.AUTH0_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api/v2`,
    requiredEnv: ["AUTH0_DOMAIN", "AUTH0_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.AUTH0_ACCESS_TOKEN}` }),
  },
  clerk: {
    baseUrl: "https://api.clerk.com/v1",
    requiredEnv: ["CLERK_SECRET_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.CLERK_SECRET_KEY}` }),
  },
  workos: {
    baseUrl: "https://api.workos.com",
    requiredEnv: ["WORKOS_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.WORKOS_API_KEY}` }),
  },

  // ── Databases ─────────────────────────────────────────────────────────────
  mongodb: {
    // Atlas Data API is app-scoped. The Admin API uses digest auth, which a
    // static-header gateway cannot perform, so this is the Data API.
    baseUrl: (env) =>
      `https://data.mongodb-api.com/app/${env.MONGODB_APP_ID}/endpoint/data/v1`,
    requiredEnv: ["MONGODB_APP_ID", "MONGODB_API_KEY"],
    headers: (env) => ({
      "api-key": env.MONGODB_API_KEY,
      "Content-Type": "application/json",
    }),
  },
  upstash: {
    // Upstash Redis over REST — endpoint is per-database.
    baseUrl: (env) =>
      `https://${env.UPSTASH_REDIS_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["UPSTASH_REDIS_URL", "UPSTASH_REDIS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.UPSTASH_REDIS_TOKEN}` }),
  },
  neon: {
    baseUrl: "https://console.neon.tech/api/v2",
    requiredEnv: ["NEON_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.NEON_API_KEY}`, Accept: "application/json" }),
  },
  turso: {
    baseUrl: "https://api.turso.tech/v1",
    requiredEnv: ["TURSO_API_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.TURSO_API_TOKEN}` }),
  },

  // ── Observability ─────────────────────────────────────────────────────────
  datadog: {
    // Region-scoped host; US1 and EU are different sites entirely.
    baseUrl: (env) => `https://api.${env.DATADOG_SITE || "datadoghq.com"}/api/v2`,
    requiredEnv: ["DATADOG_API_KEY", "DATADOG_APP_KEY"],
    headers: (env) => ({
      "DD-API-KEY": env.DATADOG_API_KEY,
      "DD-APPLICATION-KEY": env.DATADOG_APP_KEY,
    }),
  },
  newrelic: {
    baseUrl: "https://api.newrelic.com/v2",
    requiredEnv: ["NEWRELIC_API_KEY"],
    headers: (env) => ({ "Api-Key": env.NEWRELIC_API_KEY }),
  },
  betterstack: {
    baseUrl: "https://uptime.betterstack.com/api/v2",
    requiredEnv: ["BETTERSTACK_API_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.BETTERSTACK_API_TOKEN}` }),
  },
  rollbar: {
    baseUrl: "https://api.rollbar.com/api/1",
    requiredEnv: ["ROLLBAR_ACCESS_TOKEN"],
    headers: (env) => ({ "X-Rollbar-Access-Token": env.ROLLBAR_ACCESS_TOKEN }),
  },

  // ── Search ────────────────────────────────────────────────────────────────
  meilisearch: {
    baseUrl: (env) =>
      `https://${env.MEILISEARCH_HOST.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["MEILISEARCH_HOST", "MEILISEARCH_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.MEILISEARCH_API_KEY}` }),
  },
  typesense: {
    baseUrl: (env) =>
      `https://${env.TYPESENSE_HOST.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["TYPESENSE_HOST", "TYPESENSE_API_KEY"],
    headers: (env) => ({ "X-TYPESENSE-API-KEY": env.TYPESENSE_API_KEY }),
  },

  // ── AI providers (for the app's OWN AI features, not the platform's) ──────
  anthropic: {
    // anthropic-version is mandatory; omitting it 400s.
    baseUrl: "https://api.anthropic.com/v1",
    requiredEnv: ["ANTHROPIC_API_KEY"],
    headers: (env) => ({
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    }),
  },
  google_ai: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiredEnv: ["GOOGLE_AI_API_KEY"],
    headers: (env) => ({ "x-goog-api-key": env.GOOGLE_AI_API_KEY }),
  },
  mistral: {
    baseUrl: "https://api.mistral.ai/v1",
    requiredEnv: ["MISTRAL_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.MISTRAL_API_KEY}` }),
  },
  cohere: {
    baseUrl: "https://api.cohere.com/v2",
    requiredEnv: ["COHERE_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.COHERE_API_KEY}` }),
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    requiredEnv: ["GROQ_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.GROQ_API_KEY}` }),
  },

  // ── Product analytics ─────────────────────────────────────────────────────
  mixpanel: {
    // Project secret as the basic-auth username, blank password.
    baseUrl: "https://api.mixpanel.com",
    requiredEnv: ["MIXPANEL_PROJECT_SECRET"],
    headers: (env) => ({ Authorization: basic(env.MIXPANEL_PROJECT_SECRET, "") }),
  },
  amplitude: {
    baseUrl: "https://amplitude.com/api/2",
    requiredEnv: ["AMPLITUDE_API_KEY", "AMPLITUDE_SECRET_KEY"],
    headers: (env) => ({ Authorization: basic(env.AMPLITUDE_API_KEY, env.AMPLITUDE_SECRET_KEY) }),
  },
  segment: {
    // Write key as username, blank password.
    baseUrl: "https://api.segment.io/v1",
    requiredEnv: ["SEGMENT_WRITE_KEY"],
    headers: (env) => ({
      Authorization: basic(env.SEGMENT_WRITE_KEY, ""),
      "Content-Type": "application/json",
    }),
  },

  // ── Feature flags ─────────────────────────────────────────────────────────
  launchdarkly: {
    // Raw token, no scheme keyword — adding "Bearer" breaks it.
    baseUrl: "https://app.launchdarkly.com/api/v2",
    requiredEnv: ["LAUNCHDARKLY_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: env.LAUNCHDARKLY_ACCESS_TOKEN }),
  },
  statsig: {
    baseUrl: "https://statsigapi.net/console/v1",
    requiredEnv: ["STATSIG_CONSOLE_API_KEY"],
    headers: (env) => ({ "STATSIG-API-KEY": env.STATSIG_CONSOLE_API_KEY }),
  },

  // ── Video & streaming ─────────────────────────────────────────────────────
  zoom: {
    baseUrl: "https://api.zoom.us/v2",
    requiredEnv: ["ZOOM_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.ZOOM_ACCESS_TOKEN}` }),
  },
  mux: {
    baseUrl: "https://api.mux.com",
    requiredEnv: ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET"],
    headers: (env) => ({ Authorization: basic(env.MUX_TOKEN_ID, env.MUX_TOKEN_SECRET) }),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Batch added 2026-07-30 (136 → 180). Fourteen more categories.
  //
  // ALSO SKIPPED, ON PURPOSE, for the same header-injection reason as before —
  // recorded here so nobody "fixes" the omission by adding a broken entry:
  //   Pusher        signs a per-request HMAC into the query string
  //   Hunter.io     api_key as a query parameter only
  //   Alpha Vantage apikey as a query parameter only
  //   OpenWeather   appid as a query parameter only
  // A gateway that injects static headers cannot serve any of them.
  // ───────────────────────────────────────────────────────────────────────────

  // ── Headless CMS ──────────────────────────────────────────────────────────
  sanity: {
    baseUrl: (env) => `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01`,
    requiredEnv: ["SANITY_PROJECT_ID", "SANITY_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.SANITY_TOKEN}` }),
  },
  strapi: {
    baseUrl: (env) =>
      `https://${env.STRAPI_HOST.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api`,
    requiredEnv: ["STRAPI_HOST", "STRAPI_API_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.STRAPI_API_TOKEN}` }),
  },
  directus: {
    baseUrl: (env) =>
      `https://${env.DIRECTUS_HOST.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["DIRECTUS_HOST", "DIRECTUS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.DIRECTUS_TOKEN}` }),
  },
  hygraph: {
    // Region is baked into the host and differs per project; take it whole.
    baseUrl: (env) =>
      `https://${env.HYGRAPH_ENDPOINT.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["HYGRAPH_ENDPOINT", "HYGRAPH_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.HYGRAPH_TOKEN}` }),
  },
  payload: {
    // Payload's scheme is "users API-Key <key>", not Bearer.
    baseUrl: (env) =>
      `https://${env.PAYLOAD_HOST.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api`,
    requiredEnv: ["PAYLOAD_HOST", "PAYLOAD_API_KEY"],
    headers: (env) => ({ Authorization: `users API-Key ${env.PAYLOAD_API_KEY}` }),
  },
  prismic: {
    baseUrl: (env) => `https://${env.PRISMIC_REPO}.cdn.prismic.io/api/v2`,
    requiredEnv: ["PRISMIC_REPO", "PRISMIC_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.PRISMIC_ACCESS_TOKEN}` }),
  },

  // ── Notifications & realtime ──────────────────────────────────────────────
  onesignal: {
    // OneSignal wants the literal keyword "Basic" with the raw REST key — it is not
    // base64 and not a real basic-auth pair.
    baseUrl: "https://api.onesignal.com",
    requiredEnv: ["ONESIGNAL_REST_API_KEY"],
    headers: (env) => ({
      Authorization: `Basic ${env.ONESIGNAL_REST_API_KEY}`,
      "Content-Type": "application/json",
    }),
  },
  ably: {
    baseUrl: "https://rest.ably.io",
    requiredEnv: ["ABLY_KEY_NAME", "ABLY_KEY_SECRET"],
    headers: (env) => ({ Authorization: basic(env.ABLY_KEY_NAME, env.ABLY_KEY_SECRET) }),
  },
  knock: {
    baseUrl: "https://api.knock.app/v1",
    requiredEnv: ["KNOCK_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.KNOCK_API_KEY}` }),
  },
  novu: {
    baseUrl: "https://api.novu.co/v1",
    requiredEnv: ["NOVU_API_KEY"],
    headers: (env) => ({ Authorization: `ApiKey ${env.NOVU_API_KEY}` }),
  },

  // ── Speech & audio AI ─────────────────────────────────────────────────────
  deepgram: {
    baseUrl: "https://api.deepgram.com/v1",
    requiredEnv: ["DEEPGRAM_API_KEY"],
    headers: (env) => ({ Authorization: `Token ${env.DEEPGRAM_API_KEY}` }),
  },
  assemblyai: {
    // Raw key, no scheme keyword.
    baseUrl: "https://api.assemblyai.com/v2",
    requiredEnv: ["ASSEMBLYAI_API_KEY"],
    headers: (env) => ({ Authorization: env.ASSEMBLYAI_API_KEY }),
  },

  // ── Image & video generation ──────────────────────────────────────────────
  fal: {
    baseUrl: "https://fal.run",
    requiredEnv: ["FAL_KEY"],
    headers: (env) => ({ Authorization: `Key ${env.FAL_KEY}` }),
  },
  stability: {
    baseUrl: "https://api.stability.ai",
    requiredEnv: ["STABILITY_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.STABILITY_API_KEY}`, Accept: "application/json" }),
  },
  runway: {
    // Version header is mandatory.
    baseUrl: "https://api.dev.runwayml.com/v1",
    requiredEnv: ["RUNWAY_API_KEY"],
    headers: (env) => ({
      Authorization: `Bearer ${env.RUNWAY_API_KEY}`,
      "X-Runway-Version": "2024-11-06",
    }),
  },
  luma: {
    baseUrl: "https://api.lumalabs.ai/dream-machine/v1",
    requiredEnv: ["LUMA_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.LUMA_API_KEY}` }),
  },

  // ── Project management ────────────────────────────────────────────────────
  clickup: {
    // Raw token, no scheme.
    baseUrl: "https://api.clickup.com/api/v2",
    requiredEnv: ["CLICKUP_API_TOKEN"],
    headers: (env) => ({ Authorization: env.CLICKUP_API_TOKEN }),
  },
  monday: {
    baseUrl: "https://api.monday.com/v2",
    requiredEnv: ["MONDAY_API_TOKEN"],
    headers: (env) => ({ Authorization: env.MONDAY_API_TOKEN, "API-Version": "2024-10" }),
  },
  coda: {
    baseUrl: "https://coda.io/apis/v1",
    requiredEnv: ["CODA_API_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.CODA_API_TOKEN}` }),
  },
  height: {
    baseUrl: "https://api.height.app",
    requiredEnv: ["HEIGHT_API_KEY"],
    headers: (env) => ({ Authorization: `api-key ${env.HEIGHT_API_KEY}` }),
  },
  shortcut: {
    baseUrl: "https://api.app.shortcut.com/api/v3",
    requiredEnv: ["SHORTCUT_API_TOKEN"],
    headers: (env) => ({ "Shortcut-Token": env.SHORTCUT_API_TOKEN }),
  },

  // ── E-signature & document generation ─────────────────────────────────────
  docusign: {
    // Account host differs per region and between demo and production.
    baseUrl: (env) =>
      `https://${env.DOCUSIGN_HOST.replace(/^https?:\/\//, "").replace(/\/$/, "")}/restapi`,
    requiredEnv: ["DOCUSIGN_HOST", "DOCUSIGN_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.DOCUSIGN_ACCESS_TOKEN}` }),
  },
  dropbox_sign: {
    baseUrl: "https://api.hellosign.com/v3",
    requiredEnv: ["DROPBOX_SIGN_API_KEY"],
    headers: (env) => ({ Authorization: basic(env.DROPBOX_SIGN_API_KEY, "") }),
  },
  pandadoc: {
    baseUrl: "https://api.pandadoc.com/public/v1",
    requiredEnv: ["PANDADOC_API_KEY"],
    headers: (env) => ({ Authorization: `API-Key ${env.PANDADOC_API_KEY}` }),
  },

  // ── Shipping & logistics ──────────────────────────────────────────────────
  shippo: {
    baseUrl: "https://api.goshippo.com",
    requiredEnv: ["SHIPPO_API_TOKEN"],
    headers: (env) => ({ Authorization: `ShippoToken ${env.SHIPPO_API_TOKEN}` }),
  },
  easypost: {
    baseUrl: "https://api.easypost.com/v2",
    requiredEnv: ["EASYPOST_API_KEY"],
    headers: (env) => ({ Authorization: basic(env.EASYPOST_API_KEY, "") }),
  },
  aftership: {
    baseUrl: "https://api.aftership.com/v4",
    requiredEnv: ["AFTERSHIP_API_KEY"],
    headers: (env) => ({ "as-api-key": env.AFTERSHIP_API_KEY }),
  },

  // ── Localisation ──────────────────────────────────────────────────────────
  deepl: {
    // Free and Pro are different hosts; a Free key on the Pro host 403s.
    baseUrl: (env) =>
      env.DEEPL_PLAN === "free" ? "https://api-free.deepl.com/v2" : "https://api.deepl.com/v2",
    requiredEnv: ["DEEPL_AUTH_KEY"],
    headers: (env) => ({ Authorization: `DeepL-Auth-Key ${env.DEEPL_AUTH_KEY}` }),
  },
  lokalise: {
    baseUrl: "https://api.lokalise.com/api2",
    requiredEnv: ["LOKALISE_API_TOKEN"],
    headers: (env) => ({ "X-Api-Token": env.LOKALISE_API_TOKEN }),
  },
  crowdin: {
    baseUrl: "https://api.crowdin.com/api/v2",
    requiredEnv: ["CROWDIN_API_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.CROWDIN_API_TOKEN}` }),
  },

  // ── Recruiting ────────────────────────────────────────────────────────────
  greenhouse: {
    baseUrl: "https://harvest.greenhouse.io/v1",
    requiredEnv: ["GREENHOUSE_API_KEY"],
    headers: (env) => ({ Authorization: basic(env.GREENHOUSE_API_KEY, "") }),
  },
  lever: {
    baseUrl: "https://api.lever.co/v1",
    requiredEnv: ["LEVER_API_KEY"],
    headers: (env) => ({ Authorization: basic(env.LEVER_API_KEY, "") }),
  },
  workable: {
    baseUrl: (env) => `https://${env.WORKABLE_SUBDOMAIN}.workable.com/spi/v3`,
    requiredEnv: ["WORKABLE_SUBDOMAIN", "WORKABLE_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.WORKABLE_ACCESS_TOKEN}` }),
  },

  // ── Accounting ────────────────────────────────────────────────────────────
  quickbooks: {
    // Realm (company) id is part of the path; sandbox is a different host.
    baseUrl: (env) =>
      env.QUICKBOOKS_ENV === "sandbox"
        ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${env.QUICKBOOKS_REALM_ID}`
        : `https://quickbooks.api.intuit.com/v3/company/${env.QUICKBOOKS_REALM_ID}`,
    requiredEnv: ["QUICKBOOKS_REALM_ID", "QUICKBOOKS_ACCESS_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.QUICKBOOKS_ACCESS_TOKEN}`,
      Accept: "application/json",
    }),
  },
  freshbooks: {
    baseUrl: "https://api.freshbooks.com",
    requiredEnv: ["FRESHBOOKS_ACCESS_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.FRESHBOOKS_ACCESS_TOKEN}`,
      "Api-Version": "alpha",
    }),
  },

  // ── Data enrichment & market data ─────────────────────────────────────────
  peopledatalabs: {
    baseUrl: "https://api.peopledatalabs.com/v5",
    requiredEnv: ["PDL_API_KEY"],
    headers: (env) => ({ "X-Api-Key": env.PDL_API_KEY }),
  },
  polygon: {
    baseUrl: "https://api.polygon.io",
    requiredEnv: ["POLYGON_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.POLYGON_API_KEY}` }),
  },
  finnhub: {
    baseUrl: "https://finnhub.io/api/v1",
    requiredEnv: ["FINNHUB_API_KEY"],
    headers: (env) => ({ "X-Finnhub-Token": env.FINNHUB_API_KEY }),
  },

  // ── Video & meetings ──────────────────────────────────────────────────────
  daily: {
    baseUrl: "https://api.daily.co/v1",
    requiredEnv: ["DAILY_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.DAILY_API_KEY}` }),
  },
  livekit: {
    baseUrl: (env) =>
      `https://${env.LIVEKIT_HOST.replace(/^(https?|wss?):\/\//, "").replace(/\/$/, "")}`,
    requiredEnv: ["LIVEKIT_HOST", "LIVEKIT_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.LIVEKIT_ACCESS_TOKEN}` }),
  },
  vimeo: {
    baseUrl: "https://api.vimeo.com",
    requiredEnv: ["VIMEO_ACCESS_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.VIMEO_ACCESS_TOKEN}`,
      Accept: "application/vnd.vimeo.*+json;version=3.4",
    }),
  },

  // ── Auth (additional providers) ───────────────────────────────────────────
  stytch: {
    baseUrl: (env) =>
      env.STYTCH_ENV === "live" ? "https://api.stytch.com/v1" : "https://test.stytch.com/v1",
    requiredEnv: ["STYTCH_PROJECT_ID", "STYTCH_SECRET"],
    headers: (env) => ({ Authorization: basic(env.STYTCH_PROJECT_ID, env.STYTCH_SECRET) }),
  },
  kinde: {
    baseUrl: (env) =>
      `https://${env.KINDE_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api/v1`,
    requiredEnv: ["KINDE_DOMAIN", "KINDE_ACCESS_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.KINDE_ACCESS_TOKEN}` }),
  },

  // ── Scheduling ────────────────────────────────────────────────────────────
  calcom: {
    baseUrl: "https://api.cal.com/v2",
    requiredEnv: ["CALCOM_API_KEY"],
    headers: (env) => ({ Authorization: `Bearer ${env.CALCOM_API_KEY}` }),
  },

  // Wiz. Already reachable as a PLATFORM scan vendor via /api/security/scan, which
  // uses WIZ_CLIENT_ID/WIZ_CLIENT_SECRET server-side. This entry is the different
  // thing Lovable ships: an APP connector, so a generated app can query Wiz itself
  // through the gateway. Same distinction the registry already makes between the
  // `github` connector and GitHub git sync.
  //
  // Wiz's GraphQL API takes a bearer token from its OAuth endpoint; the gateway
  // injects static headers and cannot run a client-credentials exchange per request,
  // so this takes a pre-issued access token rather than the id/secret pair.
  //
  // The endpoint is TENANT-SCOPED. This entry originally hardcoded
  // "https://api.wiz.io/graphql" — a host that does not exist (live DNS check
  // 2026-07-30: NXDOMAIN; the real shape is api.<region>.app.wiz.io, e.g.
  // api.us1.app.wiz.io, which resolves). Wiz shows each tenant its own API
  // endpoint URL in the console, so the user pastes that. Caught by the live host
  // sweep, which is exactly what that sweep is for.
  wiz: {
    baseUrl: (env) =>
      `https://${env.WIZ_API_ENDPOINT.replace(/^https?:\/\//, "").replace(/\/graphql\/?$/, "").replace(/\/$/, "")}/graphql`,
    requiredEnv: ["WIZ_API_ENDPOINT", "WIZ_ACCESS_TOKEN"],
    headers: (env) => ({
      Authorization: `Bearer ${env.WIZ_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    }),
  },

  // Pre-existing gap found while verifying this batch: the connectors panel
  // offered "AWS S3" but the registry had no entry, so the gateway had nothing to
  // forward to — the card was configurable and then simply did not work. Like
  // Redshift and Athena, S3 normally wants SigV4, which a static-header gateway
  // cannot produce; so this takes a pre-signed session token instead. Projects
  // needing full SigV4 should sign in an edge function.
  aws_s3: {
    baseUrl: (env) =>
      `https://s3.${env.AWS_REGION || "us-east-1"}.amazonaws.com`,
    requiredEnv: ["AWS_REGION", "AWS_SESSION_TOKEN"],
    headers: (env) => ({ Authorization: `Bearer ${env.AWS_SESSION_TOKEN}` }),
  },
};

export function resolveConnectorBaseUrl(spec: ConnectorSpec, env: Record<string, string>): string {
  return typeof spec.baseUrl === "function" ? spec.baseUrl(env) : spec.baseUrl;
}
