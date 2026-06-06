# OpenAI 429 → OpenRouter fallback

## What this fixes

The `AI Error: 429 You exceeded your current quota` error you saw means your
OpenAI billing tier is exhausted. Until now, the AI routes hit OpenAI with no
fallback — they just propagated the 429 to the user.

This patch wires automatic fallback to OpenRouter. Whenever any AI call to
OpenAI / Anthropic / Google fails with a quota, billing, or auth error AND
`OPENROUTER_API_KEY` is set, the request retries through OpenRouter with the
equivalent model.

## What you need to do

### 1. Get an OpenRouter API key

Sign up at https://openrouter.ai → Keys → Create. The key starts with
`sk-or-…`. Add ~$5 of credit to your OpenRouter account.

### 2. Add the env var

Put it in `D:\Projects\lifemarkai\.env.local` (create the file if it doesn't
exist):

```ini
OPENROUTER_API_KEY=sk-or-v1-abcdef...
```

### 3. Restart the dev server

`Ctrl+C` in the terminal where `npm run dev` is running, then:

```powershell
npm run dev
```

Env vars are only read at server boot, so a restart is required.

### 4. Verify it works

Trigger any AI action in the app. If OpenAI returns 429, you'll see a line
in the server terminal like:

```
[ai/provider] openai returned 429 for "gpt-4o"; falling back to OpenRouter (openai/gpt-4o).
```

And the AI response will arrive normally — the user sees no error.

## How the fallback decides to fire

The wrapper in `lib/ai/provider.ts` retries through OpenRouter only when:

| Condition | Why |
|---|---|
| The original provider was OpenAI / Anthropic / Google | OpenRouter already-on calls have nowhere to fall back to |
| `OPENROUTER_API_KEY` is set | Without it the retry would fail too |
| The error is 401, 402, 429, or matches `quota / rate limit / insufficient_quota / exceeded / 429` in the message | These are recoverable. Request-shape bugs (400, 422) wouldn't benefit from a retry |
| There's an equivalent OpenRouter model ID | We rewrite `gpt-4o` → `openai/gpt-4o`, `claude-sonnet-4-6` → `anthropic/claude-sonnet-4-6`, `gemini-2.0-flash` → `google/gemini-2.0-flash` |

Anything else throws as before — no silent swallowing.

## Cost note

OpenRouter charges per token, like OpenAI does — typically within a few
percent of the underlying provider's published rate. A 429 fallback isn't
"free" but it does mean you never hit a hard wall.

If you want to switch your **default** model from OpenAI to OpenRouter so
fallback isn't needed for normal traffic, set:

```ini
DEFAULT_AI_MODEL=openai/gpt-4o-mini
```

OpenRouter will charge OpenRouter's rate for that model, which is roughly the
same as OpenAI's. The difference is that OpenRouter pools quota across many
users so you're much less likely to hit a per-account limit.

## What I did NOT change

- The gateway path in `lib/ai/generate.ts` is untouched. If you deploy the
  Cloudflare Worker gateway later, it has its own fallback strategy.
- The model-routing logic in `getProvider()` is unchanged. Models still route
  to their native provider by default — OpenRouter is only used as a
  fallback OR for explicit slash-prefix model IDs.
- The Anthropic and Google paths get the same fallback treatment as OpenAI
  because the wrapping happens at the `generateAI` dispatcher level.

## Files changed

| File | Change |
|---|---|
| `lib/ai/provider.ts` | Added `toOpenRouterModel()` mapper, `isFallbackableError()` predicate, try/catch wrapper around the four provider-specific functions in `generateAI()` |

## Files NOT changed (but worth knowing)

| File | Why not |
|---|---|
| `lib/ai/generate.ts` | Just a thin wrapper around `provider.generateAI`. Since the fallback lives in `provider.ts`, every route that uses either entry point benefits. |
| `app/api/ai/*/route.ts` (15 files) | Untouched. They all call `generateAI()` from one of the two modules above, which now has the fallback baked in. |
| `gateway/src/index.ts` | The Cloudflare Worker gateway is a separate concern — its fallback strategy is independent. |
