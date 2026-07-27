/**
 * App-user connectors — per-end-user OAuth (migration 154).
 *
 * Providers config + token store/refresh helpers. Each built app's end-user
 * connects their own third-party account; the connector proxy then calls the
 * provider AS that user with the token stored in `app_user_connections`.
 *
 * OAuth client credentials come from platform env (e.g. GOOGLE_OAUTH_CLIENT_ID
 * / GOOGLE_OAUTH_CLIENT_SECRET). A provider is only "available" when both are
 * present — mirrors how the connector registry gates on required env.
 *
 * NOTE: tokens are read/written ONLY server-side via the admin (service-role)
 * client. This module must never be imported into client components.
 */

export interface AppUserOAuthProvider {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Extra params appended to the authorize request (e.g. access_type=offline). */
  authorizeParams?: Record<string, string>;
}

export const APP_USER_OAUTH_PROVIDERS: Record<string, AppUserOAuthProvider> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "profile"],
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    authorizeParams: { access_type: "offline", prompt: "consent" },
  },
  slack: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["users:read", "chat:write"],
    clientIdEnv: "SLACK_OAUTH_CLIENT_ID",
    clientSecretEnv: "SLACK_OAUTH_CLIENT_SECRET",
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["read:user", "user:email"],
    clientIdEnv: "GITHUB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
  },
  microsoft: {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["openid", "email", "profile", "offline_access", "User.Read"],
    clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
  },
  salesforce: {
    authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    scopes: ["api", "refresh_token"],
    clientIdEnv: "SALESFORCE_OAUTH_CLIENT_ID",
    clientSecretEnv: "SALESFORCE_OAUTH_CLIENT_SECRET",
  },
  hubspot: {
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: ["oauth"],
    clientIdEnv: "HUBSPOT_OAUTH_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_OAUTH_CLIENT_SECRET",
  },
  linear: {
    authorizeUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scopes: ["read", "write"],
    clientIdEnv: "LINEAR_OAUTH_CLIENT_ID",
    clientSecretEnv: "LINEAR_OAUTH_CLIENT_SECRET",
  },
};

export function getProviderConfig(provider: string): AppUserOAuthProvider | null {
  return APP_USER_OAUTH_PROVIDERS[provider] ?? null;
}

export function providerCredentials(
  provider: string,
): { clientId: string; clientSecret: string } | null {
  const cfg = getProviderConfig(provider);
  if (!cfg) return null;
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export interface AppUserConnection {
  id: string;
  project_id: string;
  app_user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[] | null;
}

export async function getAppUserConnection(
  admin: Admin,
  projectId: string,
  appUserId: string,
  provider: string,
): Promise<AppUserConnection | null> {
  const { data } = await admin
    .from("app_user_connections")
    .select("*")
    .eq("project_id", projectId)
    .eq("app_user_id", appUserId)
    .eq("provider", provider)
    .maybeSingle();
  return (data as AppUserConnection) ?? null;
}

export async function upsertAppUserConnection(
  admin: Admin,
  row: {
    project_id: string;
    app_user_id: string;
    provider: string;
    access_token: string;
    refresh_token?: string | null;
    expires_at?: string | null;
    scopes?: string[] | null;
  },
): Promise<void> {
  await admin.from("app_user_connections").upsert(
    { ...row, updated_at: new Date().toISOString() },
    { onConflict: "project_id,app_user_id,provider" },
  );
}

/** Refresh an expired token in place when a refresh_token is available. Returns the live access token. */
export async function ensureFreshToken(
  admin: Admin,
  conn: AppUserConnection,
): Promise<string> {
  const notExpired =
    !conn.expires_at || new Date(conn.expires_at).getTime() - Date.now() > 60_000;
  if (notExpired || !conn.refresh_token) return conn.access_token;

  const creds = providerCredentials(conn.provider);
  const cfg = getProviderConfig(conn.provider);
  if (!creds || !cfg) return conn.access_token;

  try {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refresh_token,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
    });
    if (!res.ok) return conn.access_token;
    const tok = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!tok.access_token) return conn.access_token;
    const expires_at = tok.expires_in
      ? new Date(Date.now() + tok.expires_in * 1000).toISOString()
      : conn.expires_at;
    await upsertAppUserConnection(admin, {
      project_id: conn.project_id,
      app_user_id: conn.app_user_id,
      provider: conn.provider,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? conn.refresh_token,
      expires_at,
      scopes: conn.scopes,
    });
    return tok.access_token;
  } catch {
    return conn.access_token;
  }
}
