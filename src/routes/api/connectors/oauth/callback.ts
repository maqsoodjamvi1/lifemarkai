import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { getProjectAccess, canWriteProjectFiles } from "@/lib/project/access";
import { getOAuthProvider } from "@/lib/oauth/providers";
import { exchangeCodeForToken } from "@/lib/oauth/exchange";
import { verifyOAuthState } from "@/lib/oauth/state";
import { upsertEnvVar } from "@/lib/server-fns/env";

/**
 * Native /api/connectors/oauth/callback — the redirect target providers
 * send the user back to after /api/connectors/oauth/start. Verifies the
 * signed state, exchanges the code for a token, and writes it into the
 * project's env vars via the same upsertEnvVar() the manual-paste form
 * uses — so nothing downstream (the generated app's code reading that env
 * var) needs to know the credential arrived via OAuth instead of a pasted
 * key.
 *
 * Always redirects back into the editor (success or failure) rather than
 * returning raw JSON — this route is only ever reached by a full-page
 * browser navigation from the provider's consent screen, never fetch().
 */
export const Route = createFileRoute("/api/connectors/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateToken = url.searchParams.get("state");
        const providerError = url.searchParams.get("error");

        const stateSecret = process.env.OAUTH_STATE_SECRET;
        const state = stateToken && stateSecret ? verifyOAuthState(stateToken, stateSecret) : null;

        const editorUrl = (projectId: string, params: Record<string, string>) =>
          `${url.origin}/editor/${projectId}?${new URLSearchParams(params).toString()}`;

        if (!state) {
          // No verified projectId to redirect into — this is the one case
          // that can't land back in an editor tab.
          return Response.json({ error: "Invalid or expired OAuth state. Please try connecting again." }, { status: 400 });
        }

        if (providerError) {
          return Response.redirect(editorUrl(state.projectId, { connector_error: providerError, connector: state.connector }), 302);
        }
        if (!code) {
          return Response.redirect(editorUrl(state.projectId, { connector_error: "missing_code", connector: state.connector }), 302);
        }

        const provider = getOAuthProvider(state.connector);
        if (!provider) {
          return Response.redirect(editorUrl(state.projectId, { connector_error: "unknown_connector", connector: state.connector }), 302);
        }

        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) {
          return Response.redirect(editorUrl(state.projectId, { connector_error: "signed_out", connector: state.connector }), 302);
        }
        // Must be the same user who called /start — otherwise a project
        // collaborator with write access could craft an authorize link for
        // this project and get a DIFFERENT collaborator to complete it,
        // planting that other user's OAuth token (e.g. their personal
        // GitHub "repo" access) into the shared project for the attacker to
        // read back via the env-var pipeline.
        if (state.userId !== user.id) {
          return Response.redirect(editorUrl(state.projectId, { connector_error: "wrong_user", connector: state.connector }), 302);
        }
        const access = await getProjectAccess(supabase, state.projectId, user.id);
        if (!canWriteProjectFiles(access)) {
          return Response.redirect(editorUrl(state.projectId, { connector_error: "forbidden", connector: state.connector }), 302);
        }

        try {
          const clientId = process.env[provider.clientIdEnv];
          const clientSecret = process.env[provider.clientSecretEnv];
          if (!clientId || !clientSecret) {
            return Response.redirect(editorUrl(state.projectId, { connector_error: "not_configured", connector: state.connector }), 302);
          }

          const token = await exchangeCodeForToken(provider, {
            code,
            redirectUri: `${url.origin}/api/connectors/oauth/callback`,
            clientId,
            clientSecret,
            codeVerifier: state.codeVerifier,
          });

          const result = await upsertEnvVar({ projectId: state.projectId, key: provider.tokenEnvKey, value: token.accessToken });
          if (result.status !== "ok") {
            return Response.redirect(editorUrl(state.projectId, { connector_error: "save_failed", connector: state.connector }), 302);
          }
        } catch (error) {
          console.error(`OAuth callback failed for ${state.connector}`, error);
          return Response.redirect(editorUrl(state.projectId, { connector_error: "exchange_failed", connector: state.connector }), 302);
        }

        return Response.redirect(editorUrl(state.projectId, { connector_connected: state.connector }), 302);
      },
    },
  },
});
