/**
 * OAuth / magic-link callback — must run on the TanStack origin so Supabase
 * session cookies are set for :3001 (not the Next :3000 host).
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { resolveSafeRedirect } from "@/lib/auth/safe-redirect";
// MUST NOT be Response.redirect() — exchangeCodeForSession() writes the Supabase
// session cookies, and the framework then appends them to this response. A
// Response.redirect() has immutable headers, so that append threw and the whole
// callback 500'd with {"unhandled":true,"message":"HTTPError"}. See the helper.
import { redirectResponse } from "@/lib/api/redirect";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const next = resolveSafeRedirect(
          url.searchParams.get("next") ?? url.searchParams.get("redirect"),
          "/dashboard",
          origin,
        );

        if (code) {
          const supabase = await createClient();
          const { error, data } = await supabase.auth.exchangeCodeForSession(code);

          if (!error && data.user) {
            const refCode = url.searchParams.get("ref");
            if (refCode) {
              try {
                const appOrigin =
                  (import.meta.env.VITE_APP_URL as string | undefined) ??
                  new URL(request.url).origin;
                await fetch(`${appOrigin}/api/referral/redeem`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    cookie: request.headers.get("cookie") ?? "",
                  },
                  body: JSON.stringify({ code: refCode }),
                });
              } catch {
                /* non-fatal */
              }
            }
            return redirectResponse(next, origin);
          }
        }

        const loginUrl = new URL("/login", origin);
        loginUrl.searchParams.set("error", "auth_callback_failed");
        loginUrl.searchParams.set("next", next);
        return redirectResponse(loginUrl);
      },
    },
  },
});
