/**
 * Gateway proxy for OAuth-based connectors.
 * Fetches the stored OAuth token for the requesting user + connector,
 * then proxies the request to the upstream API with the token injected.
 *
 * Supported connectors: slack, google_workspace, hubspot
 * Rate limit: 1000 req/min per connector per project (enforced in middleware)
 *
 * Usage from an app:
 *   fetch('/api/gateway/slack/chat.postMessage', { method: 'POST', body: … })
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params {
  params: Promise<{ connector: string; path: string[] }>;
}

// Base URLs for each supported connector
const GATEWAY_BASES: Record<string, string> = {
  slack:            "https://slack.com/api",
  google_workspace: "https://www.googleapis.com",
  hubspot:          "https://api.hubapi.com",
};

// Token refresh endpoints & grant types
const TOKEN_REFRESH: Record<string, { url: string; clientIdEnv: string; clientSecretEnv: string }> = {
  slack: {
    url: "https://slack.com/api/oauth.v2.access",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
  google_workspace: {
    url: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  hubspot: {
    url: "https://api.hubapi.com/oauth/v1/token",
    clientIdEnv: "HUBSPOT_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
  },
};

async function getOrRefreshToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  connector: string
): Promise<string | null> {
  // Fetch stored token record
  const { data: tokenRow } = await (supabase as any)
    .from("oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("connector", connector)
    .maybeSingle();

  if (!tokenRow) return null;

  // Check if expired (with 60s buffer)
  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at as string).getTime() : 0;
  const now = Date.now();
  if (expiresAt > now + 60_000) {
    return tokenRow.access_token as string;
  }

  // Attempt refresh
  const refreshConfig = TOKEN_REFRESH[connector];
  if (!refreshConfig || !tokenRow.refresh_token) return tokenRow.access_token as string;

  const clientId     = process.env[refreshConfig.clientIdEnv];
  const clientSecret = process.env[refreshConfig.clientSecretEnv];
  if (!clientId || !clientSecret) return tokenRow.access_token as string;

  try {
    const res = await fetch(refreshConfig.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokenRow.refresh_token as string,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const json = await res.json() as { access_token?: string; expires_in?: number };
    if (json.access_token) {
      const newExpiry = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
      await (supabase as any)
        .from("oauth_tokens")
        .update({ access_token: json.access_token, expires_at: newExpiry, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("connector", connector);
      return json.access_token;
    }
  } catch {
    // Fall through — return potentially-expired token
  }

  return tokenRow.access_token as string;
}

async function handler(req: NextRequest, { params }: Params) {
  const { connector, path } = await params;

  const base = GATEWAY_BASES[connector];
  if (!base) {
    return NextResponse.json({ error: `Unknown connector: ${connector}` }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getOrRefreshToken(supabase, user.id, connector);
  if (!token) {
    return NextResponse.json(
      { error: `No OAuth token found for ${connector}. Connect it in the App Connectors panel.` },
      { status: 403 }
    );
  }

  // Build upstream URL
  const upstreamPath = path.join("/");
  const upstreamUrl  = `${base}/${upstreamPath}${req.nextUrl.search}`;

  // Clone request headers and inject auth
  const headers = new Headers(req.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.delete("host");
  headers.delete("cookie");

  const upstreamRes = await fetch(upstreamUrl, {
    method:  req.method,
    headers,
    body:    req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined,
  });

  const body        = await upstreamRes.arrayBuffer();
  const resHeaders  = new Headers();
  upstreamRes.headers.forEach((v, k) => {
    if (!["content-encoding", "transfer-encoding", "connection"].includes(k.toLowerCase())) {
      resHeaders.set(k, v);
    }
  });

  return new NextResponse(body, { status: upstreamRes.status, headers: resHeaders });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
