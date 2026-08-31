import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
// Not Response.redirect(): auth.getUser() can refresh the session and write
// cookies, which the framework appends to this response — immutable headers throw.
import { redirectResponse } from "@/lib/api/redirect";
import { verifyGatewayOAuthState } from "@/lib/oauth/gateway-state";
import { GATEWAY_TOKEN_REFRESH } from "@/lib/oauth/gateway-tokens";

/**
 * Native /api/oauth/callback/:connector — gateway-connector OAuth callback.
 * Exchanges the code for tokens and stores them in oauth_tokens.
 *
 * Requires a `state` minted by /api/oauth/start/$connector, signed with
 * OAUTH_STATE_SECRET and bound to the connector + the user id that started
 * the flow (see gateway-state.ts's header comment for why this exists: this
 * route previously had no state check at all, which let a code obtained
 * through any means be handed to a victim via a crafted callback URL and
 * silently attached to the victim's own account).
 */
// Same connector -> token-endpoint config the refresh path uses, so there's
// one place that knows each provider's token URL and auth style.
const OAUTH_CONFIG = GATEWAY_TOKEN_REFRESH;

export const Route = createFileRoute("/api/oauth/callback/$connector")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { connector } = params;
        const { origin, searchParams } = new URL(request.url);
        const redirect302 = (to: string) => redirectResponse(to, origin);

        const config = OAUTH_CONFIG[connector];
        if (!config) return Response.json({ error: "Unknown connector" }, { status: 400 });

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return redirect302("/login");

        const code = searchParams.get("code");
        const error = searchParams.get("error");
        if (error) return redirect302(`/dashboard?oauth_error=${error}`);

        const stateToken = searchParams.get("state");
        const stateSecret = process.env.OAUTH_STATE_SECRET;
        const state = stateToken && stateSecret ? verifyGatewayOAuthState(stateToken, stateSecret) : null;
        if (!state || state.connector !== connector) {
          return redirect302("/dashboard?oauth_error=invalid_state");
        }
        // The state was minted for a specific user — refuse to attach a
        // token obtained under one session to a different signed-in user.
        if (state.userId !== user.id) {
          return redirect302("/dashboard?oauth_error=state_user_mismatch");
        }
        if (!code) return redirect302(`${state.returnTo}?oauth_error=cancelled`);

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        const redirectUri = `${appUrl}/api/oauth/callback/${connector}`;
        const clientId = process.env[config.clientIdEnv];
        const clientSecret = process.env[config.clientSecretEnv];
        if (!clientId || !clientSecret) return redirect302("/dashboard?oauth_error=missing_credentials");

        const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
        const body: Record<string, string> = {
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        };
        if (config.authStyle === "basic") {
          headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
          if (state.codeVerifier) body.code_verifier = state.codeVerifier;
        } else {
          body.client_id = clientId;
          body.client_secret = clientSecret;
        }

        const tokenRes = await fetch(config.url, {
          method: "POST",
          headers,
          body: new URLSearchParams(body),
        });

        const tokenData = (await tokenRes.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          scope?: string;
          error?: string;
        };

        if (!tokenData.access_token || tokenData.error) {
          return redirect302(`${state.returnTo}?oauth_error=${tokenData.error ?? "token_exchange_failed"}`);
        }

        const expiresAt = tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null;

        await supabase.from("oauth_tokens").upsert({
          user_id: user.id,
          connector,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token ?? null,
          expires_at: expiresAt,
          scope: tokenData.scope ?? null,
          raw: tokenData,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,connector" });

        return redirect302(`${state.returnTo}?oauth_success=${connector}`);
      },
    },
  },
});
