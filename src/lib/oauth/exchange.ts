/**
 * Generic OAuth2 authorization-code token exchange, parameterized by
 * OAuthProviderConfig.authStyle (see providers.ts's header comment for why
 * "basic" exists — Notion and Zoom require it instead of body params).
 */
import type { OAuthProviderConfig } from "./providers";

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  expiresIn?: number;
}

export function buildAuthorizeUrl(
  provider: OAuthProviderConfig,
  opts: { clientId: string; redirectUri: string; state: string; codeChallenge?: string },
): string {
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", opts.state);
  if (provider.scope) url.searchParams.set("scope", provider.scope);
  if (provider.connectorId === "notion") url.searchParams.set("owner", "user");
  if (provider.usesPkce && opts.codeChallenge) {
    url.searchParams.set("code_challenge", opts.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

/** Throws on any non-2xx or a response with no access_token — callers turn
 * that into a user-facing "couldn't connect" error rather than silently
 * writing an empty token into the project's env vars. */
export async function exchangeCodeForToken(
  provider: OAuthProviderConfig,
  opts: { code: string; redirectUri: string; clientId: string; clientSecret: string; codeVerifier?: string },
): Promise<OAuthTokenResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
  });
  if (provider.usesPkce && opts.codeVerifier) body.set("code_verifier", opts.codeVerifier);

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (provider.authStyle === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", opts.clientId);
    body.set("client_secret", opts.clientSecret);
  }

  const res = await fetch(provider.tokenUrl, { method: "POST", headers, body: body.toString() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${provider.connectorId} token exchange failed (${res.status}): ${text.slice(0, 500)}`);
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${provider.connectorId} token exchange returned a non-JSON response: ${text.slice(0, 200)}`);
  }
  const accessToken = json.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error(`${provider.connectorId} token exchange response had no access_token`);
  }
  return {
    accessToken,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : undefined,
  };
}
