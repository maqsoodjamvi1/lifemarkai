# In-App AI Connector Design

This is the turnkey, no-keys AI surface for apps built inside LifemarkAI. A generated app calls its project-scoped proxy; LifemarkAI keeps OpenRouter/provider credentials server-side, meters usage against the project's AI credit pool, and applies per-capability rate limits before any upstream call.

## Endpoint

`POST /api/projects/:id/ai-proxy`

Backwards-compatible chat calls still work with only `{ messages }`. New generated code should send a `capability` field:

| Capability | Body | Cost |
| --- | --- | --- |
| `chat` | `{ capability, messages, systemPrompt?, maxTokens?, temperature?, model? }` | 1 |
| `image` | `{ capability, prompt, size?, style? }` | 3 |
| `embedding` | `{ capability, input, model? }` | 1 |
| `tts` | `{ capability, text, voice?, format?, model? }` | 2 |
| `stt` | `multipart/form-data` with `capability=stt`, `file`, `language?`, `prompt?`, `model?` | 2 |

## Routing

- Chat uses `lib/ai/generate.ts`, so the AI Gateway and OpenRouter routing stay active when configured.
- Images use the shared Gemini image primary and DALL-E fallback path. When OpenRouter is configured, the image helper attempts OpenRouter's OpenAI-compatible DALL-E slug.
- Embeddings use OpenAI when `OPENAI_API_KEY` exists, otherwise OpenRouter's OpenAI-compatible endpoint with `openai/text-embedding-3-small`.
- STT/TTS currently require `OPENAI_API_KEY` because audio endpoints are not standardized across OpenRouter models.

## Generated-App Guidance

The system prompt teaches generated apps to use `/ai-proxy` for runtime AI features and never create client-side provider keys. The editor AI Integration panel exposes a copyable helper covering chat, image, embeddings, speech-to-text, and text-to-speech.

## Reliability Rules

- Keep all errors JSON-shaped with CORS headers so deployed apps can handle failures.
- Enforce `ai_credit_limit` before upstream calls.
- Increment `ai_credits_used` only after successful upstream calls.
- Keep the legacy `/image-proxy` route for existing generated apps until migration data shows it is unused.
