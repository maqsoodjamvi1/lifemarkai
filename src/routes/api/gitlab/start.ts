import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { redirectResponse } from "@/lib/api/redirect";
import { signGatewayOAuthState } from "@/lib/oauth/gateway-state";
import { randomBytes } from "node:crypto";

/**
 * Native /api/gitlab/start — GitLab counterpart of /api/github/start. See
 * that file's header comment for why this exists: signs+binds the OAuth
 * `state` to the initiating user server-side instead of the client sending
 * a raw, unsigned `state=<projectId>`, closing the same connect-CSRF class
 * already fixed for the platform connector-gateway flow.
 *
 * Query params: projectId (optional — where to send the user back to
 * after connecting; falls back to /dashboard).
 */
export const Route = createFileRoute("/api/gitlab/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { origin, searchParams } = new URL(request.url);

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return redirectResponse("/login", origin);

        const clientId = process.env.GITLAB_CLIENT_ID;
        if (!clientId) {
          return Response.json({ error: "GitLab OAuth isn't configured on this deployment — set GITLAB_CLIENT_ID." }, { status: 503 });
        }
        const stateSecret = process.env.OAUTH_STATE_SECRET;
        if (!stateSecret) {
          return Response.json({ error: "OAUTH_STATE_SECRET is not configured on this deployment." }, { status: 503 });
        }

        const projectId = searchParams.get("projectId");
        const returnTo = projectId ? `/editor/${projectId}?gitlab=connected` : "/dashboard?gitlab=connected";

        const state = signGatewayOAuthState(
          {
            connector: "gitlab",
            userId: user.id,
            nonce: randomBytes(9).toString("hex"),
            issuedAt: Math.floor(Date.now() / 1000),
            returnTo,
          },
          stateSecret,
        );

        const redirectUri = `${origin}/api/gitlab/connect`;
        const authorizeUrl = new URL("https://gitlab.com/oauth/authorize");
        authorizeUrl.searchParams.set("client_id", clientId);
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("scope", "api read_user");
        authorizeUrl.searchParams.set("state", state);

        return redirectResponse(authorizeUrl.toString());
      },
    },
  },
});
