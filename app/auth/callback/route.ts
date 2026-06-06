import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { sendWelcomeEmail } from "@/lib/email/resend";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const user = data.user;

      // Check if this is a brand-new user (profile just created)
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("onboarding_complete, full_name")
        .eq("id", user.id)
        .single();

      // Send welcome email to new users who haven't completed onboarding
      if (profile && !profile.onboarding_complete && user.email) {
        try {
          await sendWelcomeEmail(user.email, profile.full_name ?? user.email.split("@")[0]);
        } catch (e) {
          // Non-fatal — don't block login
          console.error("Failed to send welcome email:", e);
        }
      }

      // Redeem referral code if present
      const refCode = searchParams.get("ref");
      if (refCode) {
        try {
          await fetch(`${origin}/api/referral/redeem`, {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") ?? "" },
            body: JSON.stringify({ code: refCode }),
          });
        } catch { /* non-fatal */ }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
