/**
 * OAuth callback handler for gateway connectors.
 * Exchanges the authorization code for tokens and stores them in oauth_tokens.
 * Redirect URL: /api/oauth/callback/[connector]?code=…&state=…
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ connector: string }> }

const OAUTH_CONFIG: Record<string, {
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}> = {
  slack: {
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
  google_workspace: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  hubspot: {
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientIdEnv: "HUBSPOT_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
  },
};

export async function GET(req: NextRequest, { params }: Params) {
  const { connector } = await params;
  const config = OAUTH_CONFIG[connector];
  if (!config) return NextResponse.json({ error: "Unknown connector" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const code  = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL(`/dashboard?oauth_error=${error ?? "cancelled"}`, req.url));
  }

  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/oauth/callback/${connector}`;
  const clientId    = process.env[config.clientIdEnv];
  const clientSecret= process.env[config.clientSecretEnv];

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/dashboard?oauth_error=missing_credentials", req.url));
  }

  // Exchange code for tokens
  const tokenRes = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const tokenData = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };

  if (!tokenData.access_token || tokenData.error) {
    return NextResponse.redirect(new URL(`/dashboard?oauth_error=${tokenData.error ?? "token_exchange_failed"}`, req.url));
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  await (supabase as any).from("oauth_tokens").upsert({
    user_id:       user.id,
    connector,
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token ?? null,
    expires_at:    expiresAt,
    scope:         tokenData.scope ?? null,
    raw:           tokenData,
    updated_at:    new Date().toISOString(),
  }, { onConflict: "user_id,connector" });

  return NextResponse.redirect(new URL(`/dashboard?oauth_success=${connector}`, req.url));
}
