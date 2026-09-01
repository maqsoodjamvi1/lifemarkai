import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/gitlab/client";
// Not Response.redirect(): a Supabase session refresh during this request writes
// cookies, which the framework appends here — immutable headers would throw.
import { redirectResponse } from "@/lib/api/redirect";
import { verifyGatewayOAuthState } from "@/lib/oauth/gateway-state";

/**
 * Native /api/gitlab/connect — GitLab OAuth callback.
 * OAuth app scope: api + read_user. Env: GITLAB_CLIENT_ID/SECRET, NEXT_PUBLIC_APP_URL.
 *
 * Requires a `state` minted by /api/gitlab/start, signed with
 * OAUTH_STATE_SECRET and bound to the user id that started the flow (same
 * fix as /api/github/connect — see /api/github/start's header comment for
 * the CSRF this closes: previously `state` was just the raw, unsigned
 * projectId).
 */
const GL_TOKEN_URL = "https://gitlab.com/oauth/token";

export const Route = createFileRoute("/api/gitlab/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { searchParams, origin } = new URL(request.url);
        const code = searchParams.get("code");
        const stateToken = searchParams.get("state");
        const error = searchParams.get("error");

        const redirect302 = (to: string) => redirectResponse(to, origin);

        if (error || !code) return redirect302("/dashboard?error=gitlab_denied");

        const stateSecret = process.env.OAUTH_STATE_SECRET;
        const state = stateToken && stateSecret ? verifyGatewayOAuthState(stateToken, stateSecret) : null;
        if (!state || state.connector !== "gitlab") {
          return redirect302("/dashboard?error=gitlab_invalid_state");
        }

        const supabaseForAuth = await createClient();
        const { data: { user: authUser } } = await supabaseForAuth.auth.getUser();
        if (!authUser) return redirect302("/login");
        // The state was minted for a specific user — refuse to attach a
        // token obtained under one session to a different signed-in user.
        if (state.userId !== authUser.id) {
          return redirect302("/dashboard?error=gitlab_state_user_mismatch");
        }

        const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/gitlab/connect`;

        const tokenRes = await fetch(GL_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            client_id: process.env.GITLAB_CLIENT_ID,
            client_secret: process.env.GITLAB_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          }),
        });

        if (!tokenRes.ok) {
          console.error("GitLab token exchange failed", await tokenRes.text());
          return redirect302("/dashboard?error=gitlab_token");
        }

        const tokenData = await tokenRes.json();
        const accessToken: string = tokenData.access_token;
        if (!accessToken) return redirect302("/dashboard?error=gitlab_token");

        let glUser: { username: string; name: string };
        try {
          glUser = await getAuthenticatedUser(accessToken);
        } catch {
          return redirect302("/dashboard?error=gitlab_user");
        }

        // Reuse the already-verified session from the state check above
        // rather than fetching it again.
        await supabaseForAuth
          .from("profiles")
          .update({ gitlab_username: glUser.username, gitlab_access_token: accessToken })
          .eq("id", authUser.id);

        return redirect302(state.returnTo);
      },
    },
  },
});
