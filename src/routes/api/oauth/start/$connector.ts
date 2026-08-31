import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { signGatewayOAuthState } from "@/lib/oauth/gateway-state";
import { redirectResponse } from "@/lib/api/redirect";
import { randomBytes } from "node:crypto";

/**
 * Native /api/oauth/start/:connector — begins the platform-level "connector
 * gateway" OAuth flow (src/routes/api/gateway/$connector/$.ts and
 * src/routes/api/oauth/callback/$connector.ts). This is account-level, not
 * project-scoped: the signed-in user connects their own Slack/Google
 * Workspace account once, and any of their projects' generated apps can call
 * /api/gateway/<connector>/... with that token injected server-side.
 *
 * (HubSpot also has an entry in the callback's OAUTH_CONFIG for backward
 * compatibility with tokens connected before patch 0043, but isn't linked
 * from this start route or the connectors panel any more — HubSpot's
 * "Connect with OAuth" button now goes through the project-scoped
 * /api/connectors/oauth/start flow instead, which writes the token straight
 * into the project's own env vars rather than a shared account-level row.
 * Keeping two live "Connect HubSpot" entry points would just be confusing.)
 *
 * Query params: connector (slack | google_workspace), returnTo (optional
 * same-origin path to redirect back to after connecting; defaults to
 * /dashboard).
 */
const AUTHORIZE: Record<string, { url: string; clientIdEnv: string; scope: string; extraParams?: Record<string, string> }> = {
  slack: {
    url: "https://slack.com/oauth/v2/authorize",
    clientIdEnv: "SLACK_CLIENT_ID",
    scope: "channels:read,chat:write,users:read,team:read",
  },
  google_workspace: {
    url: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/documents",
    ].join(" "),
    extraParams: { access_type: "offline", prompt: "consent" },
  },
};

export const Route = createFileRoute("/api/oauth/start/$connector")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { connector } = params;
        const { origin, searchParams } = new URL(request.url);
        const config = AUTHORIZE[connector];
        if (!config) return Response.json({ error: `No gateway OAuth flow for "${connector}"` }, { status: 400 });

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return redirectResponse("/login", origin);

        const clientId = process.env[config.clientIdEnv];
        if (!clientId) {
          return Response.json({ error: `${connector} OAuth isn't configured on this deployment — set ${config.clientIdEnv}.` }, { status: 503 });
        }

        const stateSecret = process.env.OAUTH_STATE_SECRET;
        if (!stateSecret) {
          return Response.json({ error: "OAUTH_STATE_SECRET is not configured on this deployment." }, { status: 503 });
        }

        const returnToRaw = searchParams.get("returnTo") ?? "/dashboard";
        // Same-origin-path guard mirrors verifyGatewayOAuthState's own check —
        // enforced again here so a bad returnTo is rejected before it's ever
        // signed, not just when the callback reads it back.
        const returnTo = returnToRaw.startsWith("/") && !returnToRaw.startsWith("//") ? returnToRaw : "/dashboard";

        const state = signGatewayOAuthState(
          { connector, userId: user.id, nonce: randomBytes(9).toString("hex"), issuedAt: Math.floor(Date.now() / 1000), returnTo },
          stateSecret,
        );

        const redirectUri = `${origin}/api/oauth/callback/${connector}`;
        const authorizeUrl = new URL(config.url);
        authorizeUrl.searchParams.set("client_id", clientId);
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("scope", config.scope);
        authorizeUrl.searchParams.set("state", state);
        authorizeUrl.searchParams.set("response_type", "code");
        for (const [k, v] of Object.entries(config.extraParams ?? {})) authorizeUrl.searchParams.set(k, v);

        return redirectResponse(authorizeUrl.toString());
      },
    },
  },
});
