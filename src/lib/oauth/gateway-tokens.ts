/**
 * Shared token store/refresh for the account-level "connector gateway" OAuth
 * flow (oauth_tokens table). Used by:
 *   - src/routes/api/gateway/$connector/$.ts (proxies Slack/Google/HubSpot
 *     API calls with the stored token injected)
 *   - src/routes/api/supabase-connect/* (Management API calls for a user's
 *     own, existing Supabase project — not the platform-provisioned
 *     Lifemark Cloud path in src/lib/cloud/management.ts)
 *
 * Pulled out of the gateway proxy route so both call sites refresh the same
 * way instead of maintaining two copies of this logic that could drift —
 * in particular so a new provider (supabase) only has to describe its token
 * endpoint once.
 */
import type { createClient } from "@/lib/supabase/server";

export interface GatewayTokenRefreshConfig {
  url: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** "basic" = Authorization: Basic base64(id:secret), no client_id/secret in body (Supabase's style). */
  authStyle: "body" | "basic";
}

export const GATEWAY_TOKEN_REFRESH: Record<string, GatewayTokenRefreshConfig> = {
  slack: {
    url: "https://slack.com/api/oauth.v2.access",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    authStyle: "body",
  },
  google_workspace: {
    url: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authStyle: "body",
  },
  hubspot: {
    url: "https://api.hubapi.com/oauth/v1/token",
    clientIdEnv: "HUBSPOT_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
    authStyle: "body",
  },
  supabase: {
    url: "https://api.supabase.com/v1/oauth/token",
    clientIdEnv: "SUPABASE_OAUTH_CLIENT_ID",
    clientSecretEnv: "SUPABASE_OAUTH_CLIENT_SECRET",
    authStyle: "basic",
  },
};

interface TokenRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

/**
 * Returns a live access token for (userId, connector), refreshing it first
 * if it's expired (or near-expiry) and a refresh_token + configured client
 * credentials are available. Returns null only when there's no stored token
 * at all — an expired token with no working refresh path is returned as-is
 * (matches the pre-existing behavior in the gateway proxy: let the upstream
 * API's own 401 be the signal, rather than failing this call for a token
 * that might still be valid despite our clock).
 */
export async function getOrRefreshGatewayToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  connector: string,
): Promise<string | null> {
  const { data: tokenRow } = await supabase
    .from("oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("connector", connector)
    .maybeSingle();

  const row = tokenRow as TokenRow | null;
  if (!row) return null;

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) return row.access_token;

  const refreshConfig = GATEWAY_TOKEN_REFRESH[connector];
  if (!refreshConfig || !row.refresh_token) return row.access_token;

  const clientId = process.env[refreshConfig.clientIdEnv];
  const clientSecret = process.env[refreshConfig.clientSecretEnv];
  if (!clientId || !clientSecret) return row.access_token;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    const body: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    };
    if (refreshConfig.authStyle === "basic") {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    } else {
      body.client_id = clientId;
      body.client_secret = clientSecret;
    }

    const res = await fetch(refreshConfig.url, {
      method: "POST",
      headers,
      body: new URLSearchParams(body),
    });
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (json.access_token) {
      const newExpiry = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
      await supabase
        .from("oauth_tokens")
        .update({
          access_token: json.access_token,
          refresh_token: json.refresh_token ?? row.refresh_token,
          expires_at: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("connector", connector);
      return json.access_token;
    }
  } catch {
    // Fall through — return the potentially-expired token; the caller's own
    // upstream request will surface a 401 if it's truly no longer usable.
  }

  return row.access_token;
}
