import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

/**
 * POST /api/ai/generate-email/test
 * Sends a test email using the user-supplied Resend API key.
 * Body: { apiKey, fromEmail, fromName, to }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { apiKey, fromEmail, fromName, to } = body;

  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json({ error: "API key required" }, { status: 400 });
  }
  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: "Valid recipient email required" }, { status: 400 });
  }
  if (!fromEmail || !fromEmail.includes("@")) {
    return NextResponse.json({ error: "Valid from email required" }, { status: 400 });
  }

  try {
    const resend = new Resend(apiKey);
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const { error } = await resend.emails.send({
      from,
      to,
      subject: "✅ Email integration test — LifemarkAI",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <h2 style="margin:0 0 12px;font-size:20px;color:#09090b;">
            ✅ Your email integration works!
          </h2>
          <p style="color:#52525b;font-size:15px;line-height:1.6;">
            This test was sent from your project's email configuration in
            <strong>LifemarkAI</strong>. Your Resend API key is working correctly.
          </p>
          <p style="color:#52525b;font-size:14px;margin-top:24px;">
            From: <strong>${from}</strong>
          </p>
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;" />
          <p style="color:#a1a1aa;font-size:12px;">Sent via LifemarkAI Email Panel</p>
        </div>
      `,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 500 }
    );
  }
}
