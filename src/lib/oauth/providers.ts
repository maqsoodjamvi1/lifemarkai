/**
 * Managed OAuth provider registry for the connector catalogue
 * (src/components/editor/app-connectors-panel.tsx's `oauthFlow: true`
 * entries). Real authorize/token endpoints, verified against each
 * provider's current docs — not guessed — but only for the subset listed
 * here; every other `oauthFlow: true` connector keeps the existing honest
 * "paste your own token" UI unchanged rather than getting a flow built on
 * assumed endpoint shapes.
 *
 * `authStyle` covers the one real fork in how providers accept the token
 * exchange's client credentials:
 *   - "body":  client_id + client_secret as form fields (GitHub, GitLab,
 *              Discord, Linear, Asana, HubSpot)
 *   - "basic": HTTP Basic auth header, no client_secret in the body
 *              (Notion, Zoom)
 *
 * Each provider maps to exactly one connector `id` from CONNECTORS and one
 * `tokenEnvKey` — the ConnectorField.key whose value the callback route
 * writes the resulting access token into, so the rest of the connector
 * (the project's generated code reading that env var) needs no changes.
 */

export type OAuthAuthStyle = "body" | "basic";

export interface OAuthProviderConfig {
  /** Matches Connector.id in app-connectors-panel.tsx. */
  connectorId: string;
  authorizeUrl: string;
  tokenUrl: string;
  /** Space- or comma-joined per provider; passed through as the `scope` param verbatim. */
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  authStyle: OAuthAuthStyle;
  /** The connector's ConnectorField.key that receives the resulting access_token. */
  tokenEnvKey: string;
  usesPkce?: boolean;
}

export const OAUTH_PROVIDERS: OAuthProviderConfig[] = [
  {
    connectorId: "github",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "repo read:user",
    clientIdEnv: "GITHUB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
    authStyle: "body",
    tokenEnvKey: "GITHUB_ACCESS_TOKEN",
  },
  {
    connectorId: "gitlab",
    authorizeUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    scope: "api read_user",
    clientIdEnv: "GITLAB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITLAB_OAUTH_CLIENT_SECRET",
    authStyle: "body",
    tokenEnvKey: "GITLAB_TOKEN",
    usesPkce: true,
  },
  {
    connectorId: "notion",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scope: "",
    clientIdEnv: "NOTION_OAUTH_CLIENT_ID",
    clientSecretEnv: "NOTION_OAUTH_CLIENT_SECRET",
    authStyle: "basic",
    tokenEnvKey: "NOTION_API_KEY",
  },
  {
    connectorId: "discord",
    authorizeUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scope: "identify guilds webhook.incoming",
    clientIdEnv: "DISCORD_OAUTH_CLIENT_ID",
    clientSecretEnv: "DISCORD_OAUTH_CLIENT_SECRET",
    authStyle: "body",
    tokenEnvKey: "DISCORD_BOT_TOKEN",
  },
  {
    connectorId: "zoom",
    authorizeUrl: "https://zoom.us/oauth/authorize",
    tokenUrl: "https://zoom.us/oauth/token",
    scope: "",
    clientIdEnv: "ZOOM_OAUTH_CLIENT_ID",
    clientSecretEnv: "ZOOM_OAUTH_CLIENT_SECRET",
    authStyle: "basic",
    tokenEnvKey: "ZOOM_ACCESS_TOKEN",
  },
  {
    connectorId: "linear",
    authorizeUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scope: "read,write",
    clientIdEnv: "LINEAR_OAUTH_CLIENT_ID",
    clientSecretEnv: "LINEAR_OAUTH_CLIENT_SECRET",
    authStyle: "body",
    tokenEnvKey: "LINEAR_API_KEY",
  },
  {
    connectorId: "asana",
    authorizeUrl: "https://app.asana.com/-/oauth_authorize",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    scope: "default",
    clientIdEnv: "ASANA_OAUTH_CLIENT_ID",
    clientSecretEnv: "ASANA_OAUTH_CLIENT_SECRET",
    authStyle: "body",
    tokenEnvKey: "ASANA_ACCESS_TOKEN",
    usesPkce: true,
  },
  {
    connectorId: "hubspot",
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scope: "crm.objects.contacts.read crm.objects.contacts.write",
    clientIdEnv: "HUBSPOT_OAUTH_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_OAUTH_CLIENT_SECRET",
    authStyle: "body",
    tokenEnvKey: "HUBSPOT_ACCESS_TOKEN",
  },
];

export function getOAuthProvider(connectorId: string): OAuthProviderConfig | undefined {
  return OAUTH_PROVIDERS.find((p) => p.connectorId === connectorId);
}

export function isOAuthProviderConfigured(provider: OAuthProviderConfig): boolean {
  return !!process.env[provider.clientIdEnv] && !!process.env[provider.clientSecretEnv];
}
