// @ts-nocheck
/**
 * App-user connector — OAuth start (migration 154).
 *   GET /api/apps/:id/connect/:provider?app_user_id=...&redirect_to=...
 *
 * Redirects the app's END-USER to the provider's consent screen. On approval
 * the provider calls the sibling /callback route, which stores the per-user
 * token. `app_user_id` is the user's identity WITHIN the built app.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/server";
import { getProviderConfig, providerCredentials } from "@/lib/integrations/app-user-connections";


async function handleGET(req: Request, params: any) {
  const { id, provider } = params;
  const appUserId = new URL(req.url).searchParams.get("app_user_id") ?? "";
  const redirectTo = new URL(req.url).searchParams.get("redirect_to") ?? "";

  const cfg = getProviderConfig(provider);
  if (!cfg) {
    return Response.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  }
  const creds = providerCredentials(provider);
  if (!creds) {
    return Response.json(
      { error: `Provider ${provider} is not configured (missing OAuth client credentials).` },
      { status: 501 },
    );
  }
  if (!appUserId) {
    return Response.json({ error: "app_user_id is required" }, { status: 400 });
  }

  // CSRF state — random, stored, single-use.
  const stateBytes = new Uint8Array(24);
  crypto.getRandomValues(stateBytes);
  const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const admin = await createAdminClient();
  const { error } = await admin.from("app_user_oauth_state").insert({
    state,
    project_id: id,
    app_user_id: appUserId,
    provider,
    redirect_to: redirectTo || null,
  });
  if (error) {
    return Response.json({ error: "Could not start OAuth", detail: error.message }, { status: 500 });
  }

  const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  const redirectUri = `${appOrigin}/api/apps/${id}/connect/${provider}/callback`;

  const authUrl = new URL(cfg.authorizeUrl);
  authUrl.searchParams.set("client_id", creds.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", cfg.scopes.join(" "));
  authUrl.searchParams.set("state", state);
  for (const [k, v] of Object.entries(cfg.authorizeParams ?? {})) authUrl.searchParams.set(k, v);

  return Response.redirect(authUrl.toString());
}


export const Route = createFileRoute("/api/apps/$id/connect/$provider")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleGET(request, params),
    },
  },
});
