# LifemarkAI Telegram bot — setup guide

> A Telegram bot users can DM with `/build a habit tracker` and get back
> a link to the editor where the AI is already building. Built around
> three pieces: a webhook the bot calls, a link-token issuer the dashboard
> calls, and a `profiles.telegram_chat_id` migration that connects them.

## What ships

- `supabase/migrations/056_telegram_link.sql` — adds `telegram_chat_id`,
  `telegram_link_token`, `telegram_linked_at` to `profiles`.
- `app/api/integrations/telegram/link/route.ts` — issues link tokens (POST),
  reports link status (GET), unlinks (DELETE).
- `app/api/integrations/telegram/webhook/route.ts` — Telegram → LifemarkAI
  message receiver. Validates the secret-token header, handles `/start`,
  `/build`, `/help`, and plain text.
- No new env vars beyond Telegram credentials.

## Prerequisites

1. **A Telegram bot.** Talk to [@BotFather](https://t.me/BotFather):
   - `/newbot` → pick a name and a username ending in `Bot`
   - BotFather replies with a token like `7894561230:AAFq…` — that's your
     `TELEGRAM_BOT_TOKEN`.
2. **A bot secret token.** Generate any random 32-char string (or use
   `openssl rand -hex 32`) — this is `TELEGRAM_BOT_SECRET`. It validates
   that every incoming webhook came from Telegram, not a random poster.

## Step 1 — Apply the migration

```powershell
cd D:\Projects\lifemarkai
supabase db push
```

`056_telegram_link.sql` is additive (three nullable columns + two partial
unique indexes), so it's safe on production.

## Step 2 — Set env vars on the deploy host

```ini
TELEGRAM_BOT_TOKEN=7894561230:AAFq...           # from @BotFather
TELEGRAM_BOT_SECRET=<a random 32-char string>
TELEGRAM_BOT_USERNAME=YourBotName               # without the @ — e.g. LifemarkAIBot
```

Without `TELEGRAM_BOT_SECRET` the webhook returns 503 (intentional kill
switch — set it to enable the bot).

## Step 3 — Register the webhook with Telegram

One-time `curl`:

```powershell
$token = "your-bot-token"
$secret = "your-bot-secret"
$url = "https://lifemarkai.com/api/integrations/telegram/webhook"

curl -X POST "https://api.telegram.org/bot$token/setWebhook" `
  -H "Content-Type: application/json" `
  -d "{
    `"url`": `"$url`",
    `"secret_token`": `"$secret`",
    `"allowed_updates`": [`"message`"]
  }"
```

Telegram replies `{"ok":true,"result":true,"description":"Webhook was set"}`.
Now every message to the bot fires a POST to your webhook.

Verify with:

```powershell
curl "https://api.telegram.org/bot$token/getWebhookInfo"
```

Expected: `url` matches, `pending_update_count: 0`, `last_error_message`
empty.

## Step 4 — Test the link flow end-to-end

1. Sign into LifemarkAI as yourself.
2. Open the dashboard → Settings → "Connect Telegram" (wire this UI in
   `components/dashboard/settings-page.tsx` — see the snippet below).
3. The button POSTs to `/api/integrations/telegram/link`, which returns:
   ```json
   {
     "token": "8c4f...",
     "botUsername": "YourBotName",
     "deepLink": "https://t.me/YourBotName?start=8c4f..."
   }
   ```
4. Tap the `deepLink` → Telegram opens to your bot with **Start** queued.
5. Tap Start. The bot replies "✅ Linked." in chat.
6. Send `/build a habit tracker with daily streaks`.
7. The bot replies with the editor URL.

## Step 5 — Wire the dashboard CTA (optional but recommended)

The link-token API exists; only the dashboard button is missing. Add to
`components/dashboard/settings-page.tsx` (or wherever your account settings
live):

```tsx
const [linkInfo, setLinkInfo] = useState<{ linked: boolean; linkedAt?: string | null; botUsername?: string } | null>(null);

useEffect(() => {
  fetch("/api/integrations/telegram/link").then(r => r.json()).then(setLinkInfo);
}, []);

async function connectTelegram() {
  const res = await fetch("/api/integrations/telegram/link", { method: "POST" });
  const { deepLink } = await res.json();
  window.open(deepLink, "_blank");
}

async function disconnectTelegram() {
  await fetch("/api/integrations/telegram/link", { method: "DELETE" });
  setLinkInfo({ linked: false });
}
```

That's enough for the basic UX. The full UI surface is intentionally not
in this scaffold — drop it in once the bot is live and you've tested.

## Security notes

- Every webhook POST is rejected unless the `X-Telegram-Bot-Api-Secret-Token`
  header matches `TELEGRAM_BOT_SECRET`. The secret is never logged.
- The link token is one-time: the bot clears it the moment it consumes it.
  Re-running `/start <oldtoken>` returns "token isn't valid".
- One Telegram chat ID maps to one LifemarkAI user (enforced by the unique
  index in migration 056). If the user wants to link a second LifemarkAI
  account they have to unlink the first.
- The webhook ALWAYS returns 200 to Telegram so it doesn't retry. Real
  errors are logged server-side and the user gets a friendly message.

## What this does NOT do (yet)

- **Voice messages, photos, files.** Bot only handles text. Possible
  follow-up: forward voice notes through OpenAI Whisper → existing
  `/api/ai/transcribe` route.
- **Inline mode.** A `@LifemarkAIBot <prompt>` shortcut from any chat
  would require enabling inline mode with BotFather plus an extra path
  in the webhook. Defer.
- **Status updates while the build runs.** Right now the bot replies with
  the editor URL and goes silent. A future enhancement could subscribe
  to the project's Realtime channel and push "Done" / "Failed" updates
  back to Telegram.
- **Group chats.** The current code treats every chat as 1:1. Group-chat
  support means handling `@LifemarkAIBot /build …` mentions and deciding
  whose account the build runs under.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `getWebhookInfo` shows `last_error_message: "Wrong response from the webhook: 503"` | `TELEGRAM_BOT_SECRET` not set on the host | Set it; the route returns 503 deliberately when missing |
| Bot acks `/start <token>` but doesn't link | Token was already consumed or never minted | Issue a fresh token via the dashboard |
| Bot says "link your account" forever | `telegram_chat_id` write failed (RLS, missing migration) | Confirm migration 056 ran; check Supabase logs |
| Webhook errors don't show up locally | Telegram sends to your **production** URL | Use `ngrok` or a local tunnel + override the webhook URL during dev |

## Reference: command surface

| Command | Effect |
|---|---|
| `/start <token>` | Link this chat to the LifemarkAI user that minted the token. |
| `/start` (no token) | Show welcome instructions. |
| `/build <prompt>` | Create a project. Replies with the editor URL. |
| `/help` | Show command list. |
| Plain text (any other message) | Treated as `/build <text>`. Convenience. |
