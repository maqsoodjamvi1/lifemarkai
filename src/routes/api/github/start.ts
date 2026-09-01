import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { redirectResponse } from "@/lib/api/redirect";
import { signGatewayOAuthState } from "@/lib/oauth/gateway-state";
import { randomBytes } from "node:crypto";

/**
 * Native /api/github/start — begins the "connect GitHub account" OAuth
 * flow. This exists so the `state` param handed to GitHub can be signed
 * server-side (OAUTH_STATE_SECRET) and bound to the initiating user, the
 * same fix already applied to the platform connector-gateway flow (see
 * gateway-state.ts's header comment). Before this route existed, the
 * client built the GitHub authorize URL itself with a raw, unsigned
 * `state=<projectId>` — a classic OAuth connect CSRF: a code obtained
 * through any means (an attacker's own GitHub consent, a stolen code)
 * could be handed to a signed-in victim via a crafted
 * /api/github/connect?code=...&state=... link and would silently
 * overwrite the victim's own profiles.github_access_token with the
 * attacker's token.
 *
 * Query params: projectId (optional — where to send the user back to
 * after connecting; falls back to /dashboard).
 */
export const Route = createFileRoute("/api/github/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { origin, searchParams } = new URL(request.url);

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return redirectResponse("/login", origin);

        const clientId = process.env.GITHUB_CLIENT_ID;
        if (!clientId) {
          return Response.json({ error: "GitHub OAuth isn't configured on this deployment — set GITHUB_CLIENT_ID." }, { status: 503 });
        }
        const stateSecret = process.env.OAUTH_STATE_SECRET;
        if (!stateSecret) {
          return Response.json({ error: "OAUTH_STATE_SECRET is not configured on this deployment." }, { status: 503 });
        }

        const projectId = searchParams.get("projectId");
        const returnTo = projectId ? `/editor/${projectId}?github=connected` : "/dashboard?github=connected";

        const state = signGatewayOAuthState(
          {
            connector: "github",
            userId: user.id,
            nonce: randomBytes(9).toString("hex"),
            issuedAt: Math.floor(Date.now() / 1000),
            returnTo,
          },
          stateSecret,
        );

        const redirectUri = `${origin}/api/github/connect`;
        const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
        authorizeUrl.searchParams.set("client_id", clientId);
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("scope", "repo");
        authorizeUrl.searchParams.set("state", state);

        return redirectResponse(authorizeUrl.toString());
      },
    },
  },
});
