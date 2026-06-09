import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

async function main() {
  const sb = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data: auth, error } = await sb.auth.signInWithPassword({
    email: "demo@lifemarkai.app",
    password: "DemoPassword123!",
  });
  if (error || !auth.session) {
    console.log(JSON.stringify({ error: error?.message ?? "no session" }));
    process.exit(1);
  }

  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const cookie =
    "sb-" +
    ref +
    "-auth-token=" +
    encodeURIComponent(
      JSON.stringify({
        access_token: auth.session.access_token,
        refresh_token: auth.session.refresh_token,
        expires_at: auth.session.expires_at,
        expires_in: auth.session.expires_in,
        token_type: auth.session.token_type,
        user: auth.session.user,
      })
    );

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const credits = await fetch("http://localhost:3000/api/billing/credits", {
      headers: { Cookie: cookie },
      signal: ctrl.signal,
    });
    const grant = await fetch("http://localhost:3000/api/billing/dev-grant", {
      method: "POST",
      headers: { Cookie: cookie },
      signal: ctrl.signal,
    });
    console.log(
      JSON.stringify({
        creditsStatus: credits.status,
        credits: await credits.json(),
        grantStatus: grant.status,
        grant: await grant.json(),
      })
    );
  } catch (e) {
    console.log(JSON.stringify({ fetchError: String(e) }));
  } finally {
    clearTimeout(t);
  }
}

main();
