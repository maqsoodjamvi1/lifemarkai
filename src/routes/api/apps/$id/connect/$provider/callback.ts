/**
 * App-user connector — OAuth callback (migration 154).
 *   GET /api/apps/:id/connect/:provider/callback?code=...&state=...
 *
 * Validates the CSRF state, exchanges the auth code for tokens, stores the
 * per-end-user connection, and redirects back to the app.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/server";
import { redirectResponse } from "@/lib/api/redirect";
import {
getProviderConfig,
providerCredentials,
upsertAppUserConnection,
} from "@/lib/integrations/app-user-connections";


async function handleGET(req: Request, params: any) {
  const { id, provider } = params;
  const code = new URL(req.url).searchParams.get("code");
  const state = new URL(req.url).searchParams.get("state");
  const oauthError = new URL(req.url).searchParams.get("error");

  const admin = await createAdminClient();

  const fail = (msg: string, status = 400) =>
    Response.json({ error: msg }, { status });

  if (oauthError) return fail(`Provider returned an error: ${oauthError}`);
  if (!code || !state) return fail("Missing code or state");

  // Validate + consume the single-use state. Unlike the platform-level
  // gateway/managed-connector flows (src/lib/oauth/{state,gateway-state}.ts),
  // this state is a random token stored in a row rather than a signed,
  // self-describing payload, so it had no expiry check of its own — a state
  // row that was minted but never completed (browser closed on the
  // provider's consent screen, tab abandoned) stayed valid forever. It was
  // never guessable or otherwise attacker-reachable (24 random bytes,
  // single-use, and the table is revoked from anon/authenticated — only the
  // admin client can read it), so this was a hygiene gap rather than an
  // exploitable one, but it's worth matching the same 10-minute window the
  // sibling flows use.
  const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
  const { data: stateRow } = await admin
    .from("app_user_oauth_state")
    .select("*")
    .eq("state", state)
    .maybeSingle();
  if (!stateRow || stateRow.project_id !== id || stateRow.provider !== provider) {
    return fail("Invalid or expired OAuth state", 401);
  }
  await admin.from("app_user_oauth_state").delete().eq("state", state);
  const stateAgeMs = Date.now() - new Date(stateRow.created_at).getTime();
  if (!(stateAgeMs >= 0) || stateAgeMs > OAUTH_STATE_MAX_AGE_MS) {
    return fail("OAuth state expired — please reconnect", 401);
  }

  const cfg = getProviderConfig(provider);
  const creds = providerCredentials(provider);
  if (!cfg || !creds) return fail("Provider not configured", 501);

  const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  const redirectUri = `${appOrigin}/api/apps/${id}/connect/${provider}/callback`;

  let token: { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  try {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) return fail(`Token exchange failed: ${await res.text()}`, 502);
    token = await res.json();
  } catch (err) {
    return fail(`Token exchange error: ${err instanceof Error ? err.message : String(err)}`, 502);
  }

  // Slack nests the user token under authed_user; most providers return it flat.
  const accessToken =
    token.access_token ??
    (token as unknown as { authed_user?: { access_token?: string } }).authed_user?.access_token;
  if (!accessToken) return fail("No access token returned by provider", 502);

  await upsertAppUserConnection(admin, {
    project_id: id,
    app_user_id: stateRow.app_user_id,
    provider,
    access_token: accessToken,
    refresh_token: token.refresh_token ?? null,
    expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
    scopes: token.scope ? token.scope.split(/[\s,]+/) : cfg.scopes,
  });

  const back = stateRow.redirect_to || (await getDeployedUrl(admin, id)) || appOrigin;
  const dest = new URL(back);
  dest.searchParams.set("connected", provider);
  return redirectResponse(dest.toString());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDeployedUrl(admin: any, projectId: string): Promise<string | null> {
  const { data } = await admin.from("projects").select("deployed_url").eq("id", projectId).maybeSingle();
  return data?.deployed_url ?? null;
}


export const Route = createFileRoute("/api/apps/$id/connect/$provider/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleGET(request, params),
    },
  },
});
