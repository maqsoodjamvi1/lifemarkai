// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/gitlab/client";

/**
 * Native /api/gitlab/connect — GitLab OAuth callback.
 * OAuth app scope: api + read_user. Env: GITLAB_CLIENT_ID/SECRET, NEXT_PUBLIC_APP_URL.
 */
const GL_TOKEN_URL = "https://gitlab.com/oauth/token";

export const Route = createFileRoute("/api/gitlab/connect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { searchParams, origin } = new URL(request.url);
        const code = searchParams.get("code");
        const state = searchParams.get("state"); // projectId or null
        const error = searchParams.get("error");

        const redirect302 = (to: string) => Response.redirect(new URL(to, origin), 302);

        if (error || !code) return redirect302("/dashboard?error=gitlab_denied");

        const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/gitlab/connect`;

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
          return redirect302("/dashboard?error=gitlab_token");
        }

        const tokenData = await tokenRes.json();
        const accessToken: string = tokenData.access_token;
        if (!accessToken) return redirect302("/dashboard?error=gitlab_token");

        let glUser: { username: string; name: string };
        try {
          glUser = await getAuthenticatedUser(accessToken);
        } catch {
          return redirect302("/dashboard?error=gitlab_user");
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return redirect302("/login");

        await (supabase as any)
          .from("profiles")
          .update({ gitlab_username: glUser.username, gitlab_access_token: accessToken })
          .eq("id", user.id);

        const redirectTo = state ? `/editor/${state}?gitlab=connected` : "/dashboard?gitlab=connected";
        return redirect302(redirectTo);
      },
    },
  },
});
