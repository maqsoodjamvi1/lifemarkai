// @ts-nocheck
/**
 * Telegram bot webhook — receives every update Telegram sends to the bot.
 *
 * Auth: Telegram includes the X-Telegram-Bot-Api-Secret-Token header on
 *   every request when `setWebhook` was called with `secret_token`. We
 *   compare it against TELEGRAM_BOT_SECRET. Without that env var the route
 *   returns 503 so the bot is intentionally inactive.
 *
 * Supported messages:
 *   /start <token>   — links this Telegram chat to a LifemarkAI user (the
 *                      token was minted by /api/integrations/telegram/link)
 *   /build <prompt>  — creates a project from the prompt; replies with the
 *                      editor URL
 *   /help            — usage instructions
 *   <plain text>     — treated as a /build prompt for convenience
 *
 * All replies go via sendMessage (no inline keyboards / images yet — keep
 * the surface small).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 15;

// ── Telegram types we use (loose — we only touch a handful of fields) ─────
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string; first_name?: string };
    chat: { id: number; type: string };
    text?: string;
  };
}

const TELEGRAM_API = "https://api.telegram.org";

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

async function tg(method: string, body: Record<string, unknown>): Promise<unknown> {
  const token = botToken();
  if (!token) return null;
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => null);
}

function reply(chatId: number, text: string, opts: Record<string, unknown> = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
    ...opts,
  });
}

/** Title-case + truncate a prompt into a usable project name. */
function deriveName(prompt: string): string {
  const cleaned = prompt
    .replace(/^(please\s+)?(build|create|make|generate)\s+(a|an|the)\s+/i, "")
    .replace(/[.!?].*$/, "")
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 6).join(" ");
  return (words.charAt(0).toUpperCase() + words.slice(1)) || "Telegram build";
}

export async function POST(req: NextRequest) {
  // ── 1) Auth via Telegram's secret-token header ──────────────────────────
  const expected = process.env.TELEGRAM_BOT_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
  }
  const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (incomingSecret !== expected) {
    // Don't leak whether the secret was missing or wrong.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const msg = update.message;
  if (!msg?.text || !msg.chat?.id) {
    // Reactions, channel posts, edits we don't handle — ack so Telegram
    // doesn't re-deliver.
    return NextResponse.json({ ok: true });
  }

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const supabase = await createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.com";

  try {
    // ── 2) /start <token> — link this chat to a LifemarkAI account ─────
    if (text.startsWith("/start")) {
      const token = text.slice("/start".length).trim();
      if (!token) {
        await reply(
          chatId,
          [
            "👋 *Welcome to LifemarkAI*",
            "",
            "To link your account, open the LifemarkAI dashboard → Settings → Connect Telegram. It'll give you a link that brings you back here pre-filled.",
            "",
            `Then come back and say:\n\`/build a habit tracker with daily streaks\``,
          ].join("\n"),
        );
        return NextResponse.json({ ok: true });
      }

      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("id, telegram_chat_id")
        .eq("telegram_link_token", token)
        .maybeSingle();

      if (!profile) {
        await reply(chatId, "❌ That link token isn't valid. Re-issue one from the dashboard.");
        return NextResponse.json({ ok: true });
      }
      if (profile.telegram_chat_id && profile.telegram_chat_id !== chatId) {
        await reply(
          chatId,
          "⚠️ This LifemarkAI account is already linked to a different Telegram chat. Unlink it in the dashboard first.",
        );
        return NextResponse.json({ ok: true });
      }

      await (supabase as any)
        .from("profiles")
        .update({
          telegram_chat_id: chatId,
          telegram_linked_at: new Date().toISOString(),
          telegram_link_token: null, // consume the token
        })
        .eq("id", profile.id);

      await reply(
        chatId,
        [
          "✅ *Linked.* Your Telegram is now connected to LifemarkAI.",
          "",
          "Try: `/build a calorie tracker with charts`",
          "",
          "Send `/help` for everything else.",
        ].join("\n"),
      );
      return NextResponse.json({ ok: true });
    }

    // ── 3) /help — usage ──────────────────────────────────────────────
    if (text === "/help" || text === "/?") {
      await reply(
        chatId,
        [
          "*LifemarkAI bot commands*",
          "",
          "`/build <prompt>` — create a new project from a prompt and reply with the editor URL.",
          "`/help` — this message.",
          "",
          "You can also just type a plain message; if it looks like a build request I'll treat it as `/build`.",
        ].join("\n"),
      );
      return NextResponse.json({ ok: true });
    }

    // ── 4) /build (or plain text) — create a project ─────────────────
    // Look up the user from the chat ID. Reject if they haven't linked.
    const { data: linkedProfile } = await (supabase as any)
      .from("profiles")
      .select("id")
      .eq("telegram_chat_id", chatId)
      .maybeSingle();

    if (!linkedProfile) {
      await reply(
        chatId,
        "🔗 First link your account: open the LifemarkAI dashboard → Settings → Connect Telegram.",
      );
      return NextResponse.json({ ok: true });
    }

    const prompt = text.startsWith("/build")
      ? text.slice("/build".length).trim()
      : text;

    if (prompt.length < 5) {
      await reply(chatId, "Give me a longer prompt (at least 5 chars).");
      return NextResponse.json({ ok: true });
    }
    if (prompt.length > 4000) {
      await reply(chatId, "That's a lot — keep prompts under 4000 chars.");
      return NextResponse.json({ ok: true });
    }

    const name = deriveName(prompt).slice(0, 80);

    const { data: project, error: insertErr } = await (supabase as any)
      .from("projects")
      .insert({
        user_id: linkedProfile.id,
        name,
        description: prompt,
        framework: "react",
        status: "active",
        is_public: false,
      })
      .select()
      .single();

    if (insertErr || !project) {
      await reply(chatId, `❌ Failed to create project: ${insertErr?.message ?? "unknown error"}`);
      return NextResponse.json({ ok: true });
    }

    // Queue the prompt as a starter message so the editor opens with it
    // pre-filled (same path the ChatGPT action uses).
    await (supabase as any).from("messages").insert({
      project_id: project.id,
      role: "user",
      content: prompt,
      model: null,
      tokens_used: 0,
    });

    const editorUrl = `${baseUrl}/editor/${project.id}`;
    await reply(
      chatId,
      [
        `✅ *${name}* is queued.`,
        "",
        `Open it: ${editorUrl}`,
        "",
        "The AI starts as soon as you load that link.",
      ].join("\n"),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    // We always 200 to Telegram so it doesn't retry — log + apologise in chat.
    console.error("[telegram webhook]", err);
    await reply(chatId, "🛠️ Something broke on our end. Try again in a minute.");
    return NextResponse.json({ ok: true });
  }
}
