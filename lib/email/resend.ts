import { Resend } from "resend";

// Constructing `new Resend()` with a missing/empty key THROWS. Because this
// module is imported by API routes (e.g. /api/deploy), that throw happens at
// module-eval time and crashes `next build` ("Failed to collect page data").
// Construct lazily only when a key is configured; without one, email sends
// no-op gracefully and the build/runtime never throw.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const _resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const resend = {
  emails: {
    send: async (payload: any) => {
      if (!_resend) {
        return {
          data: null,
          error: { name: "missing_api_key", message: "RESEND_API_KEY not set — email skipped" },
        };
      }
      return _resend.emails.send(payload);
    },
  },
};

const FROM_EMAIL = "LifemarkAI <noreply@lifemarkai.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.com";

// ─── Email Templates ─────────────────────────────────────────────────────────

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LifemarkAI</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#18181b;border:1px solid #27272a;border-radius:12px;overflow:hidden;">
        <!-- Logo header -->
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#2563eb);padding:24px 32px;">
            <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">⚡ LifemarkAI</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px;">Build full-stack apps with AI</div>
          </td>
        </tr>
        <!-- Content -->
        <tr><td style="padding:32px;">${content}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #27272a;">
            <p style="margin:0;font-size:12px;color:#71717a;text-align:center;">
              You're receiving this email because you have an account at
              <a href="${APP_URL}" style="color:#a78bfa;text-decoration:none;">LifemarkAI</a>.
              <br/>
              <a href="${APP_URL}/dashboard/settings" style="color:#71717a;">Unsubscribe</a> from notifications.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(text: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:16px;">${text}</a>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#fafafa;letter-spacing:-0.5px;">${text}</h1>`;
}

function para(text: string): string {
  return `<p style="margin:12px 0;font-size:15px;color:#a1a1aa;line-height:1.6;">${text}</p>`;
}

// ─── Email Senders ─────────────────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, name: string) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Welcome to LifemarkAI ⚡",
    html: baseLayout(`
      ${heading(`Welcome, ${name || "Builder"}! 🎉`)}
      ${para("You're now part of LifemarkAI — the fastest way to build full-stack apps with AI.")}
      ${para("Here's what you can do right now:")}
      <ul style="color:#a1a1aa;font-size:14px;line-height:2;padding-left:20px;">
        <li>✨ Describe your app idea and watch AI build it</li>
        <li>🤖 Use Agent Mode for autonomous development</li>
        <li>🗄 Connect Supabase for instant database + auth</li>
        <li>🚀 Deploy your app live in one click</li>
      </ul>
      ${btn("Start Building →", `${APP_URL}/dashboard`)}
      ${para("Your account starts with <strong style='color:#fafafa'>100 free credits</strong>. Each AI message uses 1–2 credits.")}
    `),
  });
}

export async function sendDeploymentEmail(to: string, projectName: string, deployUrl: string) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `🚀 ${projectName} is live!`,
    html: baseLayout(`
      ${heading("Your app is live! 🚀")}
      ${para(`<strong style="color:#fafafa">${projectName}</strong> has been successfully deployed and is now available at:`)}
      <div style="background:#09090b;border:1px solid #27272a;border-radius:8px;padding:16px;margin:16px 0;">
        <a href="${deployUrl}" style="color:#a78bfa;font-size:15px;word-break:break-all;">${deployUrl}</a>
      </div>
      ${btn("View Live App →", deployUrl)}
      ${para("Share this link with your users, clients, or team.")}
    `),
  });
}

export async function sendCollaborationInviteEmail(
  to: string,
  inviterName: string,
  projectName: string,
  role: string,
  inviteUrl: string
) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${inviterName} invited you to collaborate on ${projectName}`,
    html: baseLayout(`
      ${heading("You've been invited! 👥")}
      ${para(`<strong style="color:#fafafa">${inviterName}</strong> has invited you to collaborate on <strong style="color:#fafafa">${projectName}</strong> as a <strong style="color:#a78bfa">${role}</strong>.`)}
      ${para("LifemarkAI is an AI-powered app builder that lets teams build full-stack applications together in real time.")}
      ${btn("Accept Invitation →", inviteUrl)}
      ${para("This invitation expires in 7 days. If you don't have a LifemarkAI account yet, you'll be prompted to create one.")}
    `),
  });
}

export async function sendLowCreditsEmail(to: string, creditsRemaining: number) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "⚡ You're running low on credits",
    html: baseLayout(`
      ${heading("Running low on credits")}
      ${para(`You have <strong style="color:#f59e0b">${creditsRemaining} credits</strong> remaining. To keep building without interruption, consider upgrading your plan.`)}
      <div style="background:#451a03;border:1px solid #92400e;border-radius:8px;padding:16px;margin:16px 0;">
        <div style="color:#fbbf24;font-weight:600;margin-bottom:8px;">💡 Pro Plan — $20/month</div>
        <div style="color:#a1a1aa;font-size:14px;line-height:1.8;">
          ✓ 1,000 credits per month<br/>
          ✓ GPT-4o + Claude 3.5 Sonnet<br/>
          ✓ Unlimited projects<br/>
          ✓ Priority support
        </div>
      </div>
      ${btn("Upgrade Plan →", `${APP_URL}/dashboard/billing`)}
    `),
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Reset your LifemarkAI password",
    html: baseLayout(`
      ${heading("Reset your password")}
      ${para("We received a request to reset your password. Click the button below to choose a new one.")}
      ${btn("Reset Password →", resetUrl)}
      ${para("This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.")}
    `),
  });
}

export async function sendCreditsPurchasedEmail(to: string, credits: number, amount: string) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `✅ ${credits} credits added to your account`,
    html: baseLayout(`
      ${heading("Credits purchased! ✅")}
      ${para(`<strong style="color:#22c55e">${credits} credits</strong> have been added to your LifemarkAI account. You were charged <strong style="color:#fafafa">${amount}</strong>.`)}
      ${para("Your credits never expire. Start building right away!")}
      ${btn("Go to Dashboard →", `${APP_URL}/dashboard`)}
    `),
  });
}

// ─── Team invitation ──────────────────────────────────────────────────────────
export async function sendTeamInviteEmail(
  to: string,
  inviterName: string,
  teamName: string,
  role: string,
  acceptUrl: string
) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${inviterName} invited you to join ${teamName} on LifemarkAI`,
    html: baseLayout(`
      ${heading(`You've been invited to join ${teamName}! 🎉`)}
      ${para(`<strong style="color:#fafafa">${inviterName}</strong> has invited you to join the <strong style="color:#a78bfa">${teamName}</strong> workspace as a <strong style="color:#fafafa">${role}</strong>.`)}
      ${para("LifemarkAI is an AI-powered app builder where teams build full-stack apps with AI. You'll share a credit pool and a collaborative workspace.")}
      ${btn("Accept Invitation →", acceptUrl)}
      ${para("This invitation expires in 7 days. If you don't have an account yet, you can create one after clicking the link above.")}
      <div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:12px 16px;margin-top:16px;">
        <div style="font-size:12px;color:#71717a;">Or paste this URL in your browser:</div>
        <div style="font-size:12px;color:#a78bfa;word-break:break-all;margin-top:4px;">${acceptUrl}</div>
      </div>
    `),
  });
}

// ─── Generic send (for API routes that build their own HTML) ──────────────────
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  return resend.emails.send({ from: FROM_EMAIL, to, subject, html });
}

// ─── Team credit pool topped up ───────────────────────────────────────────────
export async function sendTeamCreditsPurchasedEmail(
  to: string,
  teamName: string,
  credits: number,
  amount: string
) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `✅ ${credits} credits added to ${teamName}`,
    html: baseLayout(`
      ${heading("Team credits added! ✅")}
      ${para(`<strong style="color:#22c55e">${credits} credits</strong> have been added to the <strong style="color:#fafafa">${teamName}</strong> shared pool. You were charged <strong style="color:#fafafa">${amount}</strong>.`)}
      ${para("Your team can now use these credits for AI-powered builds and chats. Credits never expire.")}
      ${btn("View Team Billing →", `${APP_URL}/dashboard/billing`)}
    `),
  });
}
