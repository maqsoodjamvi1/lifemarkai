/**
 * Which Docker network preview sandboxes join so Traefik can route
 * https://<project>.<SANDBOX_PREVIEW_DOMAIN> to them.
 *
 * Coolify's proxy already uses the `coolify` network. Creating a private
 * `lifemark-previews` network that Traefik is not attached to makes HTTPS
 * previews silently 404.
 */

export const DEFAULT_SANDBOX_NETWORK = "lifemark-previews";
export const COOLIFY_PROXY_NETWORK = "coolify";

export function pickProxyNetworkName(
  explicit: string | null | undefined,
  existingNames: string[],
): string {
  const e = (explicit ?? "").trim();
  if (e) return e;
  if (existingNames.includes(COOLIFY_PROXY_NETWORK)) return COOLIFY_PROXY_NETWORK;
  return DEFAULT_SANDBOX_NETWORK;
}

/** When the chosen network is missing, return a fail-closed hint (or null to create it). */
export function proxyNetworkMissingError(name: string): string | null {
  if (name === COOLIFY_PROXY_NETWORK) {
    return (
      'Coolify Traefik network "coolify" was not found. Attach the LifemarkAI ' +
      "service to that network and set SANDBOX_PROXY_NETWORK=coolify."
    );
  }
  return null;
}

/** Docker returns 403/409 when the container is already on the target network. */
export function proxyNetworkConnectOk(status: number, body = ""): boolean {
  if (status < 400) return true;
  return status === 403 || status === 409 || /already (exists|connected)/i.test(body);
}

/** Traefik answered, but the sandbox behind it did not. */
export function publicGatewayDown(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

/**
 * Inner vite is up, Traefik still 502s, and a connect was not a fresh attach.
 * That is the Coolify recycle case: Docker says "already on coolify" while the
 * current Traefik network endpoint is stale.
 */
export function shouldRejoinProxyNetwork(opts: {
  innerServing: boolean;
  newlyAttached: boolean;
  publicStatus: number;
}): boolean {
  return opts.innerServing && !opts.newlyAttached && publicGatewayDown(opts.publicStatus);
}

/** Docker API filter for live preview containers that Traefik may still be routing. */
export function sandboxRunningFilter(): Record<string, string[]> {
  return { label: ["lifemark.sandbox=1"], status: ["running"] };
}
