import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const projectId = req.nextUrl.searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(new URL("/dashboard?error=github_denied", req.url));
  }

  // Exchange code for token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    return NextResponse.redirect(new URL("/dashboard?error=github_token", req.url));
  }

  // Get GitHub user
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const githubUser = await userRes.json();

  // Save token to profile
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  await (supabase as any).from("profiles").update({
    github_username: githubUser.login,
    github_access_token: accessToken,
  }).eq("id", user.id);

  const redirectUrl = projectId
    ? `/editor/${projectId}?github=connected`
    : "/dashboard?github=connected";

  return NextResponse.redirect(new URL(redirectUrl, req.url));
}
