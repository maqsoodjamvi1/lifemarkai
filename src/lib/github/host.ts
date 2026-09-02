/**
 * GitHub.com vs GitHub Enterprise Server API/OAuth hosts.
 *
 * Enterprise Cloud still uses github.com. Enterprise Server uses a customer
 * hostname (https://github.mycompany.com) and REST at {origin}/api/v3.
 *
 * Instance default: GITHUB_ENTERPRISE_HOST (or GITHUB_API_URL).
 * Per-user override: profiles.github_api_base (PAT / custom server).
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "169.254.169.254",
  "metadata.google.internal",
]);

export function envGitHubWebHost(): string | null {
  const raw = (process.env.GITHUB_ENTERPRISE_HOST ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (host === "github.com" || host === "www.github.com") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function envGitHubApiBase(): string | null {
  const explicit = (process.env.GITHUB_API_URL ?? "").trim().replace(/\/+$/, "");
  if (explicit) {
    const normalized = normalizeGitHubApiBase(explicit);
    return normalized || null;
  }
  const web = envGitHubWebHost();
  return web ? `${web}/api/v3` : null;
}

/** https origin for OAuth and html links. Null input → env GHE or github.com. */
export function resolveGitHubWebOrigin(webOrigin?: string | null): string {
  const fromArg = normalizeGitHubWebOrigin(webOrigin);
  if (fromArg) return fromArg;
  return envGitHubWebHost() ?? "https://github.com";
}

export function githubOAuthAuthorizeUrl(webOrigin?: string | null): string {
  return `${resolveGitHubWebOrigin(webOrigin)}/login/oauth/authorize`;
}

export function githubOAuthTokenUrl(webOrigin?: string | null): string {
  return `${resolveGitHubWebOrigin(webOrigin)}/login/oauth/access_token`;
}

export function githubOAuthClientId(webOrigin?: string | null): string | undefined {
  const origin = resolveGitHubWebOrigin(webOrigin);
  if (origin !== "https://github.com") {
    return process.env.GITHUB_ENTERPRISE_CLIENT_ID || process.env.GITHUB_CLIENT_ID;
  }
  return process.env.GITHUB_CLIENT_ID;
}

export function githubOAuthClientSecret(webOrigin?: string | null): string | undefined {
  const origin = resolveGitHubWebOrigin(webOrigin);
  if (origin !== "https://github.com") {
    return process.env.GITHUB_ENTERPRISE_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET;
  }
  return process.env.GITHUB_CLIENT_SECRET;
}

/** Public site origin from a stored REST base (`https://host/api/v3` or null). */
export function githubHtmlOrigin(apiBase?: string | null): string {
  const normalized = normalizeGitHubApiBase(apiBase);
  if (!normalized) return "https://github.com";
  try {
    return new URL(normalized).origin;
  } catch {
    return "https://github.com";
  }
}

export function githubRepoHtmlUrl(repoFullName: string, apiBase?: string | null): string {
  const repo = repoFullName.replace(/^\/+|\/+$/g, "");
  return `${githubHtmlOrigin(apiBase)}/${repo}`;
}

/**
 * Returns a REST API base for Octokit, or null to use api.github.com.
 * Empty string / github.com / api.github.com → null (public GitHub).
 */
/**
 * Web origin for GitHub.com or Enterprise Server.
 * github.com → `https://github.com`. Invalid / blocked → null.
 */
export function normalizeGitHubWebOrigin(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost")) return null;
    if (host === "github.com" || host === "www.github.com" || host === "api.github.com") {
      return "https://github.com";
    }
    return u.origin;
  } catch {
    return null;
  }
}

export function normalizeGitHubApiBase(input: string | null | undefined): string | null {
  const web = normalizeGitHubWebOrigin(input);
  if (!web || web === "https://github.com") return null;
  return `${web}/api/v3`;
}

export function resolveGitHubApiBase(profileApiBase?: string | null): string | null {
  return normalizeGitHubApiBase(profileApiBase) ?? envGitHubApiBase();
}

export function githubUserEndpoint(apiBase: string | null): string {
  return `${apiBase ?? "https://api.github.com"}/user`;
}
