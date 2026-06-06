// @ts-nocheck
/**
 * GitLab OAuth callback handler.
 *
 * Trigger: redirect_uri set to /api/gitlab/connect
 * OAuth app scope: api + read_user
 *
 * Env vars required:
 *   GITLAB_CLIENT_ID
 *   GITLAB_CLIENT_SECRET
 *   NEXT_PUBLIC_APP_URL
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/gitlab/client";

const GL_TOKEN_URL = "https://gitlab.com/oauth/token";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // projectId or null
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/dashboard?error=gitlab_denied", req.url));
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/gitlab/connect`;

  // Exchange authorization code for access token
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
    return NextResponse.redirect(new URL("/dashboard?error=gitlab_token", req.url));
  }

  const tokenData = await tokenRes.json();
  const accessToken: string = tokenData.access_token;

  if (!accessToken) {
    return NextResponse.redirect(new URL("/dashboard?error=gitlab_token", req.url));
  }

  // Get GitLab user info
  let glUser: { username: string; name: string };
  try {
    glUser = await getAuthenticatedUser(accessToken);
  } catch {
    return NextResponse.redirect(new URL("/dashboard?error=gitlab_user", req.url));
  }

  // Persist to profile
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  await (supabase as any)
    .from("profiles")
    .update({
      gitlab_username: glUser.username,
      gitlab_access_token: accessToken,
    })
    .eq("id", user.id);

  const redirectTo = state
    ? `/editor/${state}?gitlab=connected`
    : "/dashboard?gitlab=connected";

  return NextResponse.redirect(new URL(redirectTo, req.url));
}
