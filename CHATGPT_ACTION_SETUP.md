# LifemarkAI Custom GPT — setup guide

> Lets ChatGPT users trigger LifemarkAI builds directly from a chat with a
> Custom GPT. The GPT asks for a project description, hits the LifemarkAI
> API, and replies with a link to the editor where the build is already in
> progress.

## What ships

- `app/api/integrations/openai/openapi.json/route.ts` — serves a Custom-GPT-ready
  OpenAPI 3.1 spec at `/api/integrations/openai/openapi.json`. The spec
  embeds the production host URL via `NEXT_PUBLIC_APP_URL`, so previews
  and staging environments get their own valid spec automatically.
- `app/api/integrations/openai/build/route.ts` — the endpoint the GPT calls.
  API-key auth, scope check, rate limiting, project creation, starter message
  insertion.
- No new tables, no new migrations. Re-uses the existing `api_keys` table
  via `validateApiKey()` from `/api/keys/route.ts`.

## Prerequisites

1. **OpenAI account with Custom GPT access** — included in ChatGPT Plus and
   Team plans.
2. **A LifemarkAI API key with the `projects:create` scope.** Mint one at
   `https://lifemarkai.com/dashboard/settings → API keys`. Keys are
   prefixed `lmk_` and validated by `validateApiKey()`.

## Step 1 — Confirm the spec endpoint works

After deploying this change, visit:

```
https://lifemarkai.com/api/integrations/openai/openapi.json
```

You should see a JSON document starting with `{"openapi": "3.1.0", …}` and
mentioning `servers: [{ url: "https://lifemarkai.com" }]`. If servers shows
`http://localhost:3000`, the deploy host doesn't have `NEXT_PUBLIC_APP_URL`
set — fix that env var first.

## Step 2 — Create the Custom GPT in ChatGPT

1. Open https://chat.openai.com/gpts → **Create**.
2. In the **Configure** tab, set:
   - **Name**: `LifemarkAI Builder` (or whatever you want)
   - **Description**: `Turn a prompt into a working web app. I create a
     LifemarkAI project, queue your prompt, and send you the editor link.`
   - **Instructions**: paste the recommended block below.
3. Scroll to **Actions** → **Create new action**.
4. Click **Import from URL** and paste:
   ```
   https://lifemarkai.com/api/integrations/openai/openapi.json
   ```
   ChatGPT will fetch the spec and show one operation: `createProject`.
5. Under **Authentication** → pick **API Key** → **Custom** header.
   - Auth Type: `API Key`
   - Custom Header Name: `X-LifemarkAI-Key`
   - API Key value: paste the `lmk_…` key from Step 0.
6. **Save** and exit Configure.

## Step 3 — Test the GPT

In the GPT's chat window, try:

> Build me a habit tracker with daily streaks and a colored graph.

The GPT should:
1. Confirm what you want (optional — depends on its instructions).
2. Call `createProject` with the prompt.
3. Reply with the `editorUrl` so you can click through.

If the call fails, the error JSON is shown verbatim — the most common
failures are:

| Symptom | Cause | Fix |
|---|---|---|
| `Missing API key` | Auth not set on the action | Re-do Step 2.5 |
| `API key is missing the projects:create scope` | Key was minted without the scope | Re-mint with the right scope checked |
| `Rate limit exceeded` | Too many calls in the bucket | Wait 60s |
| `prompt is required` | The GPT sent a tool-call without filling prompt | Tighten the GPT's instructions |

## Recommended GPT instructions

Paste this verbatim into the Custom GPT's Instructions box. It biases the
GPT toward calling the action with a well-formed prompt and explains the
guardrails to the user.

```
You are the LifemarkAI Builder. You turn natural-language descriptions
into running web apps by calling the createProject action.

When a user describes an app:
1. Confirm in ONE sentence what you're about to build (no long
   restatements).
2. Choose a framework if the user named one ("next", "react", "vue",
   "svelte", "vanilla"). Default to "react" otherwise.
3. Call createProject with prompt = the full user request, framework =
   chosen framework, name = a short snappy title (or omit and let the API
   derive one).
4. Reply with the editorUrl as a clickable link and tell the user the
   build will start as soon as they open it.

If the user says something vague like "build me something", ask ONE
clarifying question instead of guessing. Don't burn the action call on a
half-formed prompt.

If the API returns an error, show it verbatim and tell the user what to do
next (check API key, etc.).
```

## Security notes

- The OpenAPI spec is public (no auth on the GET). That's intentional —
  ChatGPT fetches it to render the action UI. It contains no secrets.
- The `/api/integrations/openai/build` endpoint enforces:
  - API key validation via `validateApiKey()` (same path used by `/api/ai/chat`).
  - Required `projects:create` scope on the key.
  - Rate limit per user (`RATE_LIMITS.ai` bucket).
  - Prompt length cap (4000 chars) and minimum (5 chars).
  - Framework whitelist.
- The endpoint uses `createAdminClient()` to insert into Supabase because
  the caller authenticates via API key, not Supabase session. The user
  ID comes from the validated key, never from the request body.

## What this does NOT do (yet)

- **OAuth2 + PKCE** instead of API key. Cleaner UX (one-click connect
  inside ChatGPT vs. paste-the-key), but 5x the work. Defer until
  someone asks.
- **File upload to created projects.** ChatGPT users can't currently
  attach a CSV / image to seed the build. Possible follow-up: extend
  the request schema with an `attachments` array of base64 blobs.
- **Multiple operations** — list projects, read messages, deploy, etc.
  All possible to add; each is a new path in the spec + a new endpoint.
  Starting small to keep the GPT focused.
- **Public GPT listing.** You'll need to publish the GPT manually via
  the OpenAI GPT Store interface if you want it discoverable.

## Local testing without ChatGPT

You can test the endpoint directly:

```powershell
$key = "lmk_your_key_here"
curl -X POST https://lifemarkai.com/api/integrations/openai/build `
  -H "Content-Type: application/json" `
  -H "X-LifemarkAI-Key: $key" `
  -d '{"prompt": "Build a habit tracker with daily streaks"}'
```

Expected response:

```json
{
  "projectId": "uuid…",
  "editorUrl": "https://lifemarkai.com/editor/uuid…",
  "name": "Habit tracker with daily streaks",
  "next": "Open the editor URL to watch the AI build your app."
}
```
