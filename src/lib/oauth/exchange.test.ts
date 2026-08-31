import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthorizeUrl, exchangeCodeForToken } from "./exchange";
import { getOAuthProvider } from "./providers";

const github = getOAuthProvider("github")!;
const notion = getOAuthProvider("notion")!;
const gitlab = getOAuthProvider("gitlab")!; // usesPkce: true

test("buildAuthorizeUrl includes client_id, redirect_uri, response_type, state, and scope", () => {
  const url = new URL(buildAuthorizeUrl(github, { clientId: "cid", redirectUri: "https://app.example.com/api/connectors/oauth/callback", state: "st4te" }));
  assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.example.com/api/connectors/oauth/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "st4te");
  assert.equal(url.searchParams.get("scope"), github.scope);
});

test("buildAuthorizeUrl adds owner=user for Notion specifically", () => {
  const url = new URL(buildAuthorizeUrl(notion, { clientId: "cid", redirectUri: "https://x/cb", state: "s" }));
  assert.equal(url.searchParams.get("owner"), "user");
});

test("buildAuthorizeUrl adds code_challenge params only for PKCE providers, and only when a challenge is given", () => {
  const withChallenge = new URL(buildAuthorizeUrl(gitlab, { clientId: "cid", redirectUri: "https://x/cb", state: "s", codeChallenge: "chal123" }));
  assert.equal(withChallenge.searchParams.get("code_challenge"), "chal123");
  assert.equal(withChallenge.searchParams.get("code_challenge_method"), "S256");

  const withoutChallenge = new URL(buildAuthorizeUrl(github, { clientId: "cid", redirectUri: "https://x/cb", state: "s", codeChallenge: "chal123" }));
  assert.equal(withoutChallenge.searchParams.has("code_challenge"), false);
});

test("exchangeCodeForToken sends client_id/client_secret in the body for authStyle 'body' (GitHub)", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({ access_token: "gho_abc123", scope: "repo" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await exchangeCodeForToken(github, { code: "c0de", redirectUri: "https://x/cb", clientId: "cid", clientSecret: "csecret" });
    assert.equal(result.accessToken, "gho_abc123");
    const body = new URLSearchParams(capturedInit?.body as string);
    assert.equal(body.get("client_id"), "cid");
    assert.equal(body.get("client_secret"), "csecret");
    assert.equal((capturedInit?.headers as Record<string, string>).Authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("exchangeCodeForToken uses HTTP Basic auth for authStyle 'basic' (Notion) and omits client_secret from the body", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({ access_token: "secret_abc" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await exchangeCodeForToken(notion, { code: "c0de", redirectUri: "https://x/cb", clientId: "cid", clientSecret: "csecret" });
    assert.equal(result.accessToken, "secret_abc");
    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers.Authorization, `Basic ${Buffer.from("cid:csecret").toString("base64")}`);
    const body = new URLSearchParams(capturedInit?.body as string);
    assert.equal(body.has("client_secret"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("exchangeCodeForToken includes code_verifier only for PKCE providers", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
  }) as typeof fetch;

  try {
    await exchangeCodeForToken(gitlab, { code: "c0de", redirectUri: "https://x/cb", clientId: "cid", clientSecret: "csecret", codeVerifier: "verifier123" });
    const body = new URLSearchParams(capturedInit?.body as string);
    assert.equal(body.get("code_verifier"), "verifier123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("exchangeCodeForToken throws with the response body on a non-2xx status", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("bad_verification_code", { status: 400 })) as typeof fetch;
  try {
    await assert.rejects(
      () => exchangeCodeForToken(github, { code: "bad", redirectUri: "https://x/cb", clientId: "cid", clientSecret: "csecret" }),
      /token exchange failed \(400\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("exchangeCodeForToken throws when the response has no access_token — never returns a falsy token silently", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 200 })) as typeof fetch;
  try {
    await assert.rejects(
      () => exchangeCodeForToken(github, { code: "c0de", redirectUri: "https://x/cb", clientId: "cid", clientSecret: "csecret" }),
      /had no access_token/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
