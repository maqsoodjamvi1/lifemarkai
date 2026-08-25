/**
 * What to do about a leaked credential (Lovable parity — automated key
 * revocation on public-repo leaks, Aug 10 2026).
 *
 * ── Why this stops at guidance instead of revoking ──────────────────────────
 *
 * Lovable can revoke automatically because GitHub's secret-scanning partner
 * program hands them a credential it has already CONFIRMED is live and leaked.
 * Detection here is a regex over source text, which is a guess — a
 * well-formed string in a fixture, a doc example, or a rotated-and-dead key all
 * match. Revoking on a guess breaks the user's running application, and a
 * revocation cannot be undone: the user must go to the provider, mint a new
 * key, and redeploy. The failure is asymmetric, so this module produces a
 * one-click path to revoke and lets a human take the irreversible step.
 *
 * If a confirmed-leak feed is ever wired up (GitHub push protection webhooks,
 * a provider partner program), THAT is the input that justifies automatic
 * revocation — not this scanner.
 *
 * Ordering of the steps matters and is the same everywhere: revoke first.
 * Rewriting git history or moving the key to .env first leaves a live
 * credential in a public place for as long as the cleanup takes, and the
 * scrapers that harvest public commits work in seconds.
 */

import type { SecretProvider } from "./detect-secret.ts";

export interface RevocationGuidance {
  /** Provider name as a human writes it. */
  label: string;
  /** Deep link to the page where the key is revoked or rotated. */
  consoleUrl: string;
  /** Ordered remediation steps. Step 1 is always "revoke". */
  steps: string[];
  /**
   * True when the provider bills usage or exposes customer data, so a leak has
   * a running cost until revoked. Drives whether the finding is surfaced as an
   * emergency or as hygiene.
   */
  billable: boolean;
}

const REVOKE_HISTORY_STEP =
  "Purge it from git history (git filter-repo or BFG) and force-push, then confirm the old value no longer appears in any branch, tag, or fork.";
const REVOKE_ENV_STEP =
  "Move the new value into .env.local (never committed) and reference it via process.env.";

function guidance(
  label: string,
  consoleUrl: string,
  revokeStep: string,
  billable: boolean,
): RevocationGuidance {
  return {
    label,
    consoleUrl,
    billable,
    steps: [revokeStep, REVOKE_ENV_STEP, REVOKE_HISTORY_STEP],
  };
}

export const SECRET_REVOCATION: Record<SecretProvider, RevocationGuidance> = {
  openrouter: guidance(
    "OpenRouter",
    "https://openrouter.ai/keys",
    "Delete the key in OpenRouter → Keys, then create a replacement.",
    true,
  ),
  anthropic: guidance(
    "Anthropic",
    "https://console.anthropic.com/settings/keys",
    "Delete the key in Console → API keys, then create a replacement.",
    true,
  ),
  openai: guidance(
    "OpenAI",
    "https://platform.openai.com/api-keys",
    "Revoke the key in Platform → API keys, then create a replacement.",
    true,
  ),
  stripe: guidance(
    "Stripe",
    "https://dashboard.stripe.com/apikeys",
    "Roll the key in Developers → API keys. Stripe's roll flow can keep the old key alive for a grace period — set that to expire immediately.",
    true,
  ),
  github: guidance(
    "GitHub",
    "https://github.com/settings/tokens",
    "Delete the token in Settings → Developer settings → Personal access tokens.",
    false,
  ),
  resend: guidance(
    "Resend",
    "https://resend.com/api-keys",
    "Delete the key in Resend → API Keys, then create a replacement.",
    true,
  ),
  slack: guidance(
    "Slack",
    "https://api.slack.com/apps",
    "Rotate the token in your Slack app → OAuth & Permissions (or reinstall the app to invalidate it).",
    false,
  ),
  sendgrid: guidance(
    "SendGrid",
    "https://app.sendgrid.com/settings/api_keys",
    "Delete the key in Settings → API Keys, then create a replacement.",
    true,
  ),
  google: guidance(
    "Google Cloud",
    "https://console.cloud.google.com/apis/credentials",
    "Delete the key in APIs & Services → Credentials. Also check whether it had API or referrer restrictions — an unrestricted key is the higher-severity case.",
    true,
  ),
  aws: guidance(
    "AWS",
    "https://console.aws.amazon.com/iam/home#/security_credentials",
    "Deactivate then delete the access key in IAM → the key's user → Security credentials. Review CloudTrail for use you did not initiate.",
    true,
  ),
  notion: guidance(
    "Notion",
    "https://www.notion.so/my-integrations",
    "Rotate the integration's secret in My integrations → the integration → Secrets.",
    false,
  ),
  shopify: guidance(
    "Shopify",
    "https://admin.shopify.com/settings/apps/development",
    "Uninstall or rotate credentials for the custom app in Settings → Apps and sales channels → Develop apps.",
    true,
  ),
  gitlab: guidance(
    "GitLab",
    "https://gitlab.com/-/user_settings/personal_access_tokens",
    "Revoke the token in User settings → Access tokens.",
    false,
  ),
  linear: guidance(
    "Linear",
    "https://linear.app/settings/api",
    "Revoke the key in Settings → API → Personal API keys.",
    false,
  ),
  figma: guidance(
    "Figma",
    "https://www.figma.com/settings",
    "Revoke the personal access token in Settings → Security → Personal access tokens.",
    false,
  ),
  supabase: guidance(
    "Supabase",
    "https://supabase.com/dashboard/project/_/settings/api",
    "Rotate the service-role key in Project settings → API. Treat any data reachable by that key as exposed — it bypasses row-level security entirely.",
    true,
  ),
};

export function revocationFor(provider: SecretProvider | undefined): RevocationGuidance | null {
  return provider ? SECRET_REVOCATION[provider] ?? null : null;
}

/**
 * One-line remediation summary for a finding.
 *
 * `published` raises the stakes rather than the wording: a key in a project
 * that is publicly deployed or pushed to a public repo is not "should be
 * moved to env" any more, it is "assume it is already collected".
 */
export function remediationSummary(
  provider: SecretProvider | undefined,
  opts: { live: boolean; published: boolean },
): string {
  const g = revocationFor(provider);
  if (!g) {
    return opts.published
      ? "This project is published — treat the credential as compromised, revoke it at the provider, and replace it."
      : "Move this credential into .env.local and reference it via process.env.";
  }
  if (opts.published && opts.live) {
    return `Assume this ${g.label} credential is already harvested: revoke it now at ${g.consoleUrl}, then replace and purge it from git history.`;
  }
  if (opts.live) {
    return `Revoke this ${g.label} credential at ${g.consoleUrl} and replace it — it grants live access${g.billable ? " and bills to your account" : ""}.`;
  }
  return `Rotate this ${g.label} credential at ${g.consoleUrl} and keep the replacement in .env.local.`;
}
