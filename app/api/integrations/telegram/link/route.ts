/**
 * Telegram link-token issuer.
 *
 * Called by the dashboard's "Connect Telegram" button. Generates a one-time
 * 16-byte token, stores it on profiles.telegram_link_token, and returns the
 * `t.me` URL the user opens to run `/start <token>` against the bot.
 *
 * The flow:
 *   1. User clicks "Connect Telegram" in /dashboard/settings.
 *   2. We POST here; the route mints a token and returns the t.me URL.
 *   3. User taps the URL, lands in the Telegram app, presses Start.
 *   4. Telegram's webhook receives a /start <token> message.
 *   5. The webhook route (the sibling /webhook/route.ts) consumes the token,
 *      writes telegram_chat_id and telegram_linked_at, clears the token.
 *
 * GET — return the current link status (chat_id present or not).
 * POST — mint a new token (overwrites any unconsumed previous one).
 * DELETE — unlink (clears chat_id and any pending token).
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

function botUsername(): string {
  // Set this on the deploy host once the bot exists. Default to a placeholder
  // so the dashboard surface doesn't 500 — the docs explain how to wire it.
  return process.env.TELEGRAM_BOT_USERNAME ?? "YourBotName";
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await (supabase as any)
    .from("profiles")
    .select("telegram_chat_id, telegram_linked_at")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    linked: !!data?.telegram_chat_id,
    linkedAt: data?.telegram_linked_at ?? null,
    botUsername: botUsername(),
  });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 16 random bytes → 32-char hex token. Telegram's /start command supports
  // alphanumeric payloads up to 64 chars; this fits comfortably.
  const token = randomBytes(16).toString("hex");

  const { error } = await (supabase as any)
    .from("profiles")
    .update({ telegram_link_token: token })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bot = botUsername();
  return NextResponse.json({
    token,
    botUsername: bot,
    // The user taps this; Telegram opens the chat with Start pre-filled.
    deepLink: `https://t.me/${bot}?start=${token}`,
    // Some clients respect the tg:// scheme — useful when surfacing both URLs.
    deepLinkAndroid: `tg://resolve?domain=${bot}&start=${token}`,
    expiresHint: "Token doesn't expire on a timer, but is consumed on first /start.",
  });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await (supabase as any)
    .from("profiles")
    .update({
      telegram_chat_id: null,
      telegram_link_token: null,
      telegram_linked_at: null,
    })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
