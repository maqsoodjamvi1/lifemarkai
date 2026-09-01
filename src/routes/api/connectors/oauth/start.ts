import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { getProjectAccess, canWriteProjectFiles } from "@/lib/project/access";
import { getOAuthProvider, isOAuthProviderConfigured } from "@/lib/oauth/providers";
import { buildAuthorizeUrl } from "@/lib/oauth/exchange";
import { generateCodeVerifier, codeChallengeFromVerifier } from "@/lib/oauth/pkce";
import { signOAuthState } from "@/lib/oauth/state";
import { randomBytes } from "node:crypto";

/**
 * Native /api/connectors/oauth/start — begins the managed OAuth connect
 * flow for one of the connectors in src/lib/oauth/providers.ts. Redirects
 * to the provider's consent screen; the provider redirects back to
 * /api/connectors/oauth/callback.
 *
 * Query params: projectId, connector (a Connector.id from
 * app-connectors-panel.tsx that also has an OAUTH_PROVIDERS entry).
 */
export const Route = createFileRoute("/api/connectors/oauth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const projectId = url.searchParams.get("projectId");
        const connector = url.searchParams.get("connector");
        if (!projectId || !connector) {
          return Response.json({ error: "projectId and connector are required" }, { status: 400 });
        }

        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canWriteProjectFiles(access)) {
          return Response.json({ error: "You don't have access to connect apps on this project" }, { status: 403 });
        }

        const provider = getOAuthProvider(connector);
        if (!provider) {
          return Response.json({ error: `No managed OAuth flow for "${connector}" — paste your own credentials instead.` }, { status: 404 });
        }
        if (!isOAuthProviderConfigured(provider)) {
          return Response.json(
            { error: `${connector} OAuth isn't configured on this deployment — set ${provider.clientIdEnv} and ${provider.clientSecretEnv}.` },
            { status: 503 },
          );
        }

        const stateSecret = process.env.OAUTH_STATE_SECRET;
        if (!stateSecret) {
          return Response.json({ error: "OAUTH_STATE_SECRET is not configured on this deployment." }, { status: 503 });
        }

        const codeVerifier = generateCodeVerifier();
        const state = signOAuthState(
          {
            projectId,
            connector,
            codeVerifier,
            nonce: randomBytes(9).toString("hex"),
            issuedAt: Math.floor(Date.now() / 1000),
            userId: user.id,
          },
          stateSecret,
        );

        const redirectUri = `${url.origin}/api/connectors/oauth/callback`;
        const authorizeUrl = buildAuthorizeUrl(provider, {
          clientId: process.env[provider.clientIdEnv]!,
          redirectUri,
          state,
          codeChallenge: provider.usesPkce ? codeChallengeFromVerifier(codeVerifier) : undefined,
        });

        return Response.redirect(authorizeUrl, 302);
      },
    },
  },
});
