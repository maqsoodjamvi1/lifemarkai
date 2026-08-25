/**
 * API-key paste detection (Lovable parity — "Paste an API key in chat and
 * Lovable saves it as a secret", Jun 26 2026 changelog).
 *
 * Pure + client-safe: given pasted text, detect a known secret-token shape
 * and return the canonical env-var name plus the exact matched value, so the
 * composer can swap the raw key for a labeled tag before the message is ever
 * sent or persisted.
 *
 * Deliberately conservative: only well-known, high-entropy prefixed formats.
 * Generic "long random string" heuristics are excluded — false positives in a
 * chat composer are worse than misses (the env panel always exists as the
 * explicit path).
 */

export interface DetectedSecret {
  /** Canonical env-var name, e.g. OPENAI_API_KEY */
  name: string;
  /** The exact matched token (to be replaced in the text) */
  value: string;
  /** Human label for the toast, e.g. "OpenAI API key" */
  label: string;
  /** Provider id — keys into SECRET_REVOCATION for remediation guidance. */
  provider?: SecretProvider;
}

/**
 * Provider ids. Kept separate from the env-var name because several providers
 * map many key shapes onto one env var (every Stripe key shape is
 * STRIPE_*), and remediation differs per shape: a leaked live secret key is an
 * emergency, a leaked publishable key is not.
 */
export type SecretProvider =
  | "openrouter" | "anthropic" | "openai" | "stripe" | "github" | "resend"
  | "slack" | "sendgrid" | "google" | "aws" | "notion" | "shopify"
  | "gitlab" | "linear" | "figma" | "supabase";

export interface SecretPattern {
  re: RegExp;
  name: string;
  label: string;
  provider: SecretProvider;
  /**
   * True when a match grants access to live data, money, or infrastructure.
   * Test-mode and publishable keys are false: still worth flagging, not worth
   * waking someone up for.
   */
  live: boolean;
}

/**
 * Ordered: more specific prefixes before general ones (sk-or before sk-).
 *
 * Exported so the repository scanner (static-scan.ts) tests the SAME catalog
 * this composer uses. They used to disagree — the scanner knew four formats
 * and this knew twenty-five, so a GitHub token or AWS key committed into a
 * generated project was invisible to the security panel while the identical
 * string pasted into chat was caught instantly.
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  { re: /\bsk-or-v1-[A-Za-z0-9]{32,}\b/, name: "OPENROUTER_API_KEY", label: "OpenRouter API key" , provider: "openrouter", live: true },
  { re: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/, name: "ANTHROPIC_API_KEY", label: "Anthropic API key" , provider: "anthropic", live: true },
  { re: /\bsk-proj-[A-Za-z0-9_-]{32,}\b/, name: "OPENAI_API_KEY", label: "OpenAI API key" , provider: "openai", live: true },
  { re: /\bsk_live_[A-Za-z0-9]{16,}\b/, name: "STRIPE_SECRET_KEY", label: "Stripe live secret key" , provider: "stripe", live: true },
  { re: /\bsk_test_[A-Za-z0-9]{16,}\b/, name: "STRIPE_SECRET_KEY", label: "Stripe test secret key" , provider: "stripe", live: false },
  { re: /\brk_live_[A-Za-z0-9]{16,}\b/, name: "STRIPE_RESTRICTED_KEY", label: "Stripe restricted key" , provider: "stripe", live: true },
  { re: /\bwhsec_[A-Za-z0-9]{16,}\b/, name: "STRIPE_WEBHOOK_SECRET", label: "Stripe webhook secret" , provider: "stripe", live: true },
  { re: /\bpk_live_[A-Za-z0-9]{16,}\b/, name: "STRIPE_PUBLISHABLE_KEY", label: "Stripe publishable key" , provider: "stripe", live: false },
  // Generic OpenAI-style key — AFTER all other sk- prefixes.
  { re: /\bsk-[A-Za-z0-9]{32,}\b/, name: "OPENAI_API_KEY", label: "OpenAI API key" , provider: "openai", live: true },
  { re: /\bghp_[A-Za-z0-9]{30,}\b/, name: "GITHUB_TOKEN", label: "GitHub personal access token" , provider: "github", live: true },
  { re: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/, name: "GITHUB_TOKEN", label: "GitHub fine-grained token" , provider: "github", live: true },
  { re: /\bgho_[A-Za-z0-9]{30,}\b/, name: "GITHUB_TOKEN", label: "GitHub OAuth token" , provider: "github", live: true },
  { re: /\bre_[A-Za-z0-9]{20,}\b/, name: "RESEND_API_KEY", label: "Resend API key" , provider: "resend", live: true },
  { re: /\bxoxb-[A-Za-z0-9-]{20,}\b/, name: "SLACK_BOT_TOKEN", label: "Slack bot token" , provider: "slack", live: true },
  { re: /\bxoxp-[A-Za-z0-9-]{20,}\b/, name: "SLACK_USER_TOKEN", label: "Slack user token" , provider: "slack", live: true },
  { re: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/, name: "SENDGRID_API_KEY", label: "SendGrid API key" , provider: "sendgrid", live: true },
  { re: /\bAIza[A-Za-z0-9_-]{30,}\b/, name: "GOOGLE_API_KEY", label: "Google API key" , provider: "google", live: true },
  { re: /\bAKIA[A-Z0-9]{16}\b/, name: "AWS_ACCESS_KEY_ID", label: "AWS access key ID" , provider: "aws", live: true },
  { re: /\bntn_[A-Za-z0-9]{30,}\b/, name: "NOTION_API_KEY", label: "Notion integration token" , provider: "notion", live: true },
  { re: /\bsecret_[A-Za-z0-9]{32,}\b/, name: "NOTION_API_KEY", label: "Notion integration token" , provider: "notion", live: true },
  { re: /\bshpat_[a-f0-9]{32,}\b/, name: "SHOPIFY_ACCESS_TOKEN", label: "Shopify access token" , provider: "shopify", live: true },
  { re: /\bglpat-[A-Za-z0-9_-]{20,}\b/, name: "GITLAB_TOKEN", label: "GitLab access token" , provider: "gitlab", live: true },
  { re: /\blin_api_[A-Za-z0-9]{30,}\b/, name: "LINEAR_API_KEY", label: "Linear API key" , provider: "linear", live: true },
  { re: /\bfigd_[A-Za-z0-9_-]{30,}\b/, name: "FIGMA_TOKEN", label: "Figma personal access token" , provider: "figma", live: true },
  { re: /\beyJhbGciOi[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/, name: "SUPABASE_SERVICE_ROLE_KEY", label: "JWT secret (Supabase-style)" , provider: "supabase", live: true },
];

/**
 * Detect the first known secret token in pasted text.
 * Returns null when nothing confidently matches.
 */
export function detectPastedSecret(text: string): DetectedSecret | null {
  if (!text || text.length < 20 || text.length > 10_000) return null;
  for (const { re, name, label, provider } of SECRET_PATTERNS) {
    const m = re.exec(text);
    if (m) return { name, value: m[0], label, provider };
  }
  return null;
}

/** Replace the detected token with its labeled tag, e.g. {{OPENAI_API_KEY}}. */
export function redactSecret(text: string, secret: DetectedSecret): string {
  return text.split(secret.value).join(`{{${secret.name}}}`);
}
