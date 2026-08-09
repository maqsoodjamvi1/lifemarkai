import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";

/**
 * Native /api/integrations/telegram/link — mint/consume Telegram link tokens.
 *   GET status · POST mint token (t.me deep link) · DELETE unlink
 */
function botUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME ?? "YourBotName";
}

export const Route = createFileRoute("/api/integrations/telegram/link")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data } = await supabase
          .from("profiles")
          .select("telegram_chat_id, telegram_linked_at")
          .eq("id", user.id)
          .single();

        return Response.json({
          linked: !!data?.telegram_chat_id,
          linkedAt: data?.telegram_linked_at ?? null,
          botUsername: botUsername(),
        });
      },

      POST: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const token = randomBytes(16).toString("hex");

        const { error } = await supabase
          .from("profiles").update({ telegram_link_token: token }).eq("id", user.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const bot = botUsername();
        return Response.json({
          token,
          botUsername: bot,
          deepLink: `https://t.me/${bot}?start=${token}`,
          deepLinkAndroid: `tg://resolve?domain=${bot}&start=${token}`,
          expiresHint: "Token doesn't expire on a timer, but is consumed on first /start.",
        });
      },

      DELETE: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { error } = await supabase
          .from("profiles")
          .update({ telegram_chat_id: null, telegram_link_token: null, telegram_linked_at: null })
          .eq("id", user.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({ ok: true });
      },
    },
  },
});
