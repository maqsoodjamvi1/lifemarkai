// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/oauth/callback/:connector — gateway-connector OAuth callback.
 * Exchanges the code for tokens and stores them in oauth_tokens.
 */
const OAUTH_CONFIG: Record<string, { tokenUrl: string; clientIdEnv: string; clientSecretEnv: string }> = {
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

export const Route = createFileRoute("/api/oauth/callback/$connector")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { connector } = params;
        const { origin, searchParams } = new URL(request.url);
        const redirect302 = (to: string) => Response.redirect(new URL(to, origin), 302);

        const config = OAUTH_CONFIG[connector];
        if (!config) return Response.json({ error: "Unknown connector" }, { status: 400 });

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return redirect302("/login");

        const code = searchParams.get("code");
        const error = searchParams.get("error");
        if (error || !code) return redirect302(`/dashboard?oauth_error=${error ?? "cancelled"}`);

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const redirectUri = `${appUrl}/api/oauth/callback/${connector}`;
        const clientId = process.env[config.clientIdEnv];
        const clientSecret = process.env[config.clientSecretEnv];
        if (!clientId || !clientSecret) return redirect302("/dashboard?oauth_error=missing_credentials");

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

        const tokenData = (await tokenRes.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          scope?: string;
          error?: string;
        };

        if (!tokenData.access_token || tokenData.error) {
          return redirect302(`/dashboard?oauth_error=${tokenData.error ?? "token_exchange_failed"}`);
        }

        const expiresAt = tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null;

        await (supabase as any).from("oauth_tokens").upsert({
          user_id: user.id,
          connector,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token ?? null,
          expires_at: expiresAt,
          scope: tokenData.scope ?? null,
          raw: tokenData,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,connector" });

        return redirect302(`/dashboard?oauth_success=${connector}`);
      },
    },
  },
});
