/**
 * SSRF guard for server-initiated fetches to a URL an authenticated user
 * supplied. Same private/reserved-range check already used by
 * src/routes/api/projects/$id/browser-test.ts — factored out here so the
 * outgoing-webhooks feature (src/routes/api/projects/$id/webhooks.ts +
 * src/lib/webhooks/dispatch.ts) gets the same protection instead of having
 * none.
 *
 * Outgoing webhooks previously accepted any `url` at save time with zero
 * validation, and fireProjectWebhookEvent (src/lib/webhooks/dispatch.ts)
 * then had the SERVER itself `fetch()` it on every deploy/build/AI-chat
 * event, with a signed payload attached. A project owner (any authenticated
 * user of their own project — this isn't reachable anonymously) could point
 * a webhook at, say, http://169.254.169.254/latest/meta-data/... or an
 * internal service and get the server to make that request on a schedule
 * they don't control (every matching event). validateExternalUrl closes
 * that at save time; call it again immediately before each delivery
 * (fetchTime) too, since DNS can re-resolve to a different, private address
 * between when a hostname was validated and when it's actually connected to
 * ("DNS rebinding") — this doesn't fully eliminate that window (a true fix
 * pins the validated IP for the connection itself, which the built-in
 * `fetch()` has no hook for), but re-checking right before each delivery
 * closes the overwhelmingly common case: a hostname that resolves to a
 * private address now, not one an attacker flips mid-flight.
 */
import { lookup } from "node:dns/promises";

export function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  ) {
    return true;
  }

  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

export type ExternalUrlValidation = { url: string } | { error: string };

export async function validateExternalUrl(value: string): Promise<ExternalUrlValidation> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: "url must be a valid http(s) URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "url must be http(s)" };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateIpAddress(hostname)) {
    return { error: "Internal hosts are not allowed" };
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateIpAddress(address))) {
      return { error: "Internal hosts are not allowed" };
    }
  } catch {
    return { error: "The target host could not be resolved safely" };
  }

  return { url: parsed.toString() };
}
