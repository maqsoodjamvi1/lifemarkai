/**
 * Is this request for a sandbox preview hostname that currently has no sandbox?
 *
 * Preview hostnames are wildcard DNS (`*.preview.lifemarkai.com`) and only have
 * a backend while that project's container is alive. Traefik routes by Host, so
 * between the moment a boot tears the old container down and the moment the new
 * one registers, nothing claims the hostname — and the request falls through to
 * this app, which happily renders the LifemarkAI marketing homepage.
 *
 * That is worse than an error page. It renders *inside the user's preview pane*,
 * so the app they are building appears to have been replaced by our marketing
 * site, and a preview link shared with someone else shows them a signup page
 * instead of the thing they were sent to look at. An honest "starting up" page
 * is both more truthful and less alarming.
 *
 * The editor no longer frames a preview URL until a probe confirms it (see
 * SandboxRunResult.ready), so in the normal flow nobody reaches this. It exists
 * for the paths that bypass the editor's state machine: a shared link, a manual
 * reload during a boot, a bookmark to a project whose sandbox has since been
 * reclaimed.
 */
export interface PreviewHostOptions {
  /** SANDBOX_PREVIEW_DOMAIN, e.g. "preview.lifemarkai.com". */
  previewDomain?: string | null;
  /** The app's own public host, so we never hijack ourselves. */
  appHost?: string | null;
}

function normalizeHost(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

export function isSandboxPreviewHost(
  host: string | null | undefined,
  opts: PreviewHostOptions,
): boolean {
  // A leading "*." is how the domain is written in DNS and in some configs;
  // accept it so a copy-pasted value doesn't silently disable this.
  const domain = normalizeHost(opts.previewDomain).replace(/^\*\./, "");
  if (!domain) return false;

  const h = normalizeHost(host);
  if (!h || !h.endsWith(`.${domain}`)) return false;

  // Exactly one label in front: sandbox hosts are `<projectid>.<domain>`. The
  // bare domain is not a project, and a deeper name is not something we issue.
  const label = h.slice(0, -(domain.length + 1));
  if (!label || label.includes(".")) return false;

  // If the app itself is served from under the preview domain, it must keep
  // serving the app.
  const appHost = normalizeHost(opts.appHost);
  if (appHost && h === appHost) return false;

  return true;
}

/** Read the two values from the environment, for server-side callers. */
export function previewHostOptionsFromEnv(): PreviewHostOptions {
  return {
    previewDomain: process.env.SANDBOX_PREVIEW_DOMAIN ?? null,
    appHost:
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.VITE_APP_URL ??
      null,
  };
}
