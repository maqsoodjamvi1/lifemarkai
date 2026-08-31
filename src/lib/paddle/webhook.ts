/**
 * Paddle webhook signature verification.
 *
 * Header: `Paddle-Signature: ts=<unix_seconds>;h1=<hex hmac-sha256>`
 * Signed string: `${ts}:${rawBody}`, HMAC-SHA256 keyed by the endpoint's
 * notification secret, compared to h1 with a timing-safe comparison.
 *
 * Kept dependency-free (Node's built-in node:crypto only) and separate from
 * client.ts so it has no import-time env-var requirement and can be unit
 * tested without any Paddle configuration present.
 * https://developer.paddle.com/webhooks/signature-verification
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ParsedPaddleSignature {
  ts: string;
  h1: string;
}

/** Parses `ts=...;h1=...` into its parts. Returns null if malformed. */
export function parsePaddleSignatureHeader(header: string | null): ParsedPaddleSignature | null {
  if (!header) return null;
  const parts = Object.fromEntries(
    header.split(";").map((kv) => {
      const idx = kv.indexOf("=");
      return idx === -1 ? [kv.trim(), ""] : [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    }),
  );
  if (!parts.ts || !parts.h1) return null;
  return { ts: parts.ts, h1: parts.h1 };
}

/**
 * Verifies a Paddle webhook's signature against the raw (unparsed) request
 * body. `maxSkewSeconds` rejects replayed events whose ts is stale (default
 * 5s tolerance matches Paddle's own SDKs); pass 0 to disable the check
 * (e.g. in tests using a fixed timestamp).
 */
export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  opts: { maxSkewSeconds?: number; now?: number } = {},
): boolean {
  const parsed = parsePaddleSignatureHeader(signatureHeader);
  if (!parsed || !secret) return false;

  const { maxSkewSeconds = 5 * 60, now = Math.floor(Date.now() / 1000) } = opts;
  const ts = Number(parsed.ts);
  if (!Number.isFinite(ts)) return false;
  if (maxSkewSeconds > 0 && Math.abs(now - ts) > maxSkewSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${parsed.ts}:${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(parsed.h1, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
