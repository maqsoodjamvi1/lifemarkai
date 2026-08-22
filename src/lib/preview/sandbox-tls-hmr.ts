/**
 * TLS-tunnel HMR (`wss` + clientPort 443) is required for Traefik/Modal
 * previews. Local Docker port-mode previews are plain http://localhost:42xxx —
 * leaving wss/443 in vite.config makes the Vite client fail and the browser
 * closes the document connection ("fetch failed" / blank preview).
 */
export function sandboxUsesTlsHmr(): boolean {
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
