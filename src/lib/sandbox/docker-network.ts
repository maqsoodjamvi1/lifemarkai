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
