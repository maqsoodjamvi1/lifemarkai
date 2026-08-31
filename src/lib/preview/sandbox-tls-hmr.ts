/**
 * TLS-tunnel HMR (`wss` + clientPort 443) is required for Traefik/Modal
 * previews. Local Docker port-mode previews are plain http://localhost:42xxx —
 * leaving wss/443 in vite.config makes the Vite client fail and the browser
 * closes the document connection ("fetch failed" / blank preview).
 *
 * This module (via patch-vite-for-webcontainer.ts, which every caller here
 * transitively pulls in) is being wired into the WebContainer boot path,
 * which runs IN THE BROWSER, not just the server-side sandbox-provisioning
 * routes this was originally written for. Vite's client bundle only
 * substitutes an explicit allowlist of `process.env.*` keys at build time
 * (see vite.config.ts's `define` block) — SANDBOX_PREVIEW_DOMAIN and
 * SANDBOX_PUBLIC_SCHEME are not on it, so an unguarded read left a literal
 * `process.env.X` reference in the browser bundle, which throws
 * `ReferenceError: process is not defined` the instant this runs (there is
 * no `process` global in a browser tab). WebContainer never has a TLS
 * tunnel anyway, so "no process → not a TLS tunnel" is also the correct
 * answer, not just a safe one.
 */
export function sandboxUsesTlsHmr(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  return (
    Boolean((process.env.SANDBOX_PREVIEW_DOMAIN || "").trim()) ||
    (process.env.SANDBOX_PUBLIC_SCHEME || "http").toLowerCase() === "https"
  );
}

/** Drop scaffold/model `wss`+443 HMR when the preview is plain HTTP. */
export function stripForcedTlsHmr(source: string): string {
  if (!source || sandboxUsesTlsHmr()) return source;
  return source
    .replace(/\bprotocol\s*:\s*["']wss["']\s*,?/g, "")
    .replace(/\bclientPort\s*:\s*443\s*,?/g, "")
    .replace(/,\s*,/g, ",")
    .replace(/\{\s*,/g, "{")
    .replace(/,\s*\}/g, " }");
}
