import { createFileRoute } from "@tanstack/react-router";
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

// Per-connector path allowlists. Without these, any authenticated user could
// reach ANY path on the upstream host with their stored token — e.g. all of
// googleapis.com, including admin surfaces the app never intended to expose.
// Patterns match the path AFTER the base (no leading slash, as joined below).
// Broad by design — the goal is to fence the API surface to the product areas
// generated apps legitimately use, not to enumerate individual endpoints.
// Escape hatch while iterating: GATEWAY_PATH_ALLOWLIST_DISABLED=true.
const GATEWAY_PATHS_ALLOW: Record<string, RegExp[]> = {
  // slack.com/api/<method> — Web API methods are flat "group.action" names.
  slack: [/^[a-zA-Z]+\.[a-zA-Z.]+$/],
  // googleapis.com product roots commonly used by generated apps.
  google_workspace: [
    /^gmail\//,
    /^drive\//,
    /^calendar\//,
    /^oauth2\/v[0-9]+\/userinfo/,
    /^userinfo\//,
    /^sheets\//,
    /^docs\//,
    /^v[0-9]+\/(spreadsheets|files|documents)\b/,
  ],
  // api.hubapi.com — CRM v3/v4, forms, and OAuth introspection.
  hubspot: [/^crm\//, /^forms\//, /^oauth\/v[0-9]+\//, /^contacts\/v[0-9]+\//],
};

function pathAllowed(connector: string, upstreamPath: string): boolean {
  if (process.env.GATEWAY_PATH_ALLOWLIST_DISABLED === "true") return true;
  const patterns = GATEWAY_PATHS_ALLOW[connector];
  if (!patterns) return false;
  return patterns.some((re) => re.test(upstreamPath));
}

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
  const { data: tokenRow } = await supabase
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
      await supabase
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

async function handler(req: Request, params: any) {
  const connector = params.connector as string;
  // Drop empty and traversal segments — "." / ".." must never reach the
  // upstream URL (fetch would normalize them, but normalization is exactly
  // how a path escapes an allowlist that was checked before it).
  const path = String(params._splat ?? "")
    .split("/")
    .filter((seg) => seg.length > 0 && seg !== "." && seg !== "..");

  const base = GATEWAY_BASES[connector];
  if (!base) {
    return Response.json({ error: `Unknown connector: ${connector}` }, { status: 400 });
  }

  if (!pathAllowed(connector, path.join("/"))) {
    return Response.json(
      {
        error: `Path not allowed for ${connector} gateway`,
        hint: "The connector proxy only forwards to allowlisted API surfaces. If a legitimate endpoint is blocked, extend GATEWAY_PATHS_ALLOW (or set GATEWAY_PATH_ALLOWLIST_DISABLED=true while iterating).",
      },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getOrRefreshToken(supabase, user.id, connector);
  if (!token) {
    return Response.json(
      { error: `No OAuth token found for ${connector}. Connect it in the App Connectors panel.` },
      { status: 403 }
    );
  }

  // Build upstream URL
  const upstreamPath = path.join("/");
  const upstreamUrl  = `${base}/${upstreamPath}${new URL(req.url).search}`;

  // Defense in depth: after construction, the URL's host must still be the
  // connector's host. Segment filtering above should guarantee this; if any
  // future change lets an encoded segment slip through, fail closed here
  // rather than proxying the user's bearer token to an attacker-chosen host.
  if (new URL(upstreamUrl).host !== new URL(base).host) {
    return Response.json({ error: "Gateway host mismatch" }, { status: 400 });
  }

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

  return new Response(body, { status: upstreamRes.status, headers: resHeaders });
}


export const Route = createFileRoute("/api/gateway/$connector/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handler(request, params),
      POST: async ({ request, params }) => handler(request, params),
      PUT: async ({ request, params }) => handler(request, params),
      PATCH: async ({ request, params }) => handler(request, params),
      DELETE: async ({ request, params }) => handler(request, params),
    },
  },
});
