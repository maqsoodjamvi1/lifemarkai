/**
 * Pure verification logic for GitHub's push-webhook signature
 * (src/routes/api/github/webhook.ts), pulled out of the route so it can be
 * unit tested without spinning up a request/response cycle or a database.
 *
 * A single repo name can match more than one LifemarkAI project (a repo
 * connected twice, or under different accounts), so verification tries
 * every candidate's own secret rather than assuming the first match is
 * right — the first project whose HMAC matches the header wins.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookSecretCandidate {
  id: string;
  github_webhook_secret?: string | null;
}

/** Computes the `sha256=<hex>` value GitHub expects in X-Hub-Signature-256. */
export function computeWebhookSignature(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/**
 * Constant-time compare of two `sha256=...` signature strings. Buffers of
 * different lengths are never passed to timingSafeEqual (it throws on a
 * length mismatch), so the length check happens first.
 */
export function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(actual);
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Finds which candidate project's secret verifies the given signature, or
 * undefined if none does (including when a candidate has no secret set
 * yet — a project whose webhook registration hasn't completed).
 */
export function findMatchingWebhookSecret<T extends WebhookSecretCandidate>(
  candidates: T[],
  rawBody: string,
  signatureHeader: string,
): T | undefined {
  return candidates.find((p) => {
    const secret = p.github_webhook_secret;
    if (!secret) return false;
    return signaturesMatch(computeWebhookSignature(secret, rawBody), signatureHeader);
  });
}
