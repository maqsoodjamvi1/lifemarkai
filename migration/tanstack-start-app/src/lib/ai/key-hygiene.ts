/**
 * API-key hygiene (MuseCode-parity, improvement #8).
 *
 * Users paste provider keys into .env.local / settings in every broken shape:
 * `OPENROUTER_API_KEY=sk-or-...`, wrapped in quotes, with trailing whitespace
 * or newlines. Sanitize once at the read site so every provider call gets a
 * clean token instead of a 401.
 */

const ENV_PREFIX =
  /^(?:OPENROUTER_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|GROQ_API_KEY)\s*[=:]\s*/i;

export function sanitizeApiKey(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined;
  let key = String(raw).trim();
  key = key.replace(ENV_PREFIX, "");
  // Strip one layer of matching or stray quotes.
  key = key.replace(/^["']+|["']+$/g, "").trim();
  return key.length > 0 ? key : undefined;
}
