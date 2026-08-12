import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import crypto from "node:crypto";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/resend";

/**
 * Native /api/auth/device-check — sign-in alerts. Fingerprints the device
 * (UA + accept-language, hashed), upserts it, emails the owner on a new device.
 * Best-effort: never blocks a login.
 */
export const Route = createFileRoute("/api/auth/device-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const supabase = await createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return Response.json({ ok: false }, { status: 401 });

          const rl = await rateLimitAsync(`device:${user.id}`, RATE_LIMITS.auth);
          if (!rl.success) return Response.json({ ok: false }, { status: 429 });

          const ua = (request.headers.get("user-agent") ?? "unknown").slice(0, 300);
          const lang = (request.headers.get("accept-language") ?? "").split(",")[0] ?? "";
          const deviceHash = crypto.createHash("sha256").update(`${user.id}:${ua}:${lang}`).digest("hex").slice(0, 40);

          const { data: existing } = await supabase
            .from("user_devices")
            .select("id")
            .eq("user_id", user.id)
            .eq("device_hash", deviceHash)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("user_devices")
              .update({ last_seen_at: new Date().toISOString() })
              .eq("id", (existing as { id: string }).id);
            return Response.json({ ok: true, newDevice: false });
          }

          const { count } = await supabase
            .from("user_devices")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id);

          await supabase.from("user_devices").insert({
            user_id: user.id,
            device_hash: deviceHash,
            user_agent: ua,
          });

          const isFirstDevice = (count ?? 0) === 0;
          if (!isFirstDevice && user.email) {
            try {
              const when = new Date().toUTCString();
              await sendEmail({
                to: user.email,
                subject: "New sign-in to your LifemarkAI account",
                html: `
            <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h2 style="margin:0 0 12px;font-size:18px">New device signed in</h2>
              <p style="margin:0 0 16px;color:#444;font-size:14px;line-height:1.5">
                Your LifemarkAI account was just accessed from a device we haven't seen before.
              </p>
              <table style="font-size:13px;color:#333;border-collapse:collapse">
                <tr><td style="padding:4px 12px 4px 0;color:#888">When</td><td>${when}</td></tr>
                <tr><td style="padding:4px 12px 4px 0;color:#888">Browser</td><td>${ua.replace(/</g, "&lt;").slice(0, 120)}</td></tr>
              </table>
              <p style="margin:16px 0 0;color:#444;font-size:14px;line-height:1.5">
                If this was you, no action is needed. If not, reset your password immediately
                and review your account security settings (enable 2FA if you haven't).
              </p>
            </div>`,
              });
            } catch { /* email is best-effort */ }
          }

          return Response.json({ ok: true, newDevice: !isFirstDevice });
        } catch {
          return Response.json({ ok: false });
        }
      },
    },
  },
});
