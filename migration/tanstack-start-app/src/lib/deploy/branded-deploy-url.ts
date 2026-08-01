/**
 * Build Lifemark-hosted deploy URLs for built apps.
 *
 * Every project gets a temporary public URL on a wildcard subdomain of the
 * platform "apps" domain (default `apps.lifemarkai.com`), e.g.
 *   https://my-store-<projectId>.apps.lifemarkai.com
 *
 * The FULL project id is embedded as the trailing segment of the first DNS
 * label so the host router (a `next.config` rewrite → `/preview/[projectId]`)
 * can resolve the project with an exact id lookup — no ambiguous prefix match.
 *
 * Overridable via env:
 *   LIFEMARK_APPS_DOMAIN  (default "apps.lifemarkai.com")  — wildcard host base
 *   LIFEMARK_ROOT_DOMAIN  (default "lifemarkai.com")       — branded host base
 */

const APPS_DOMAIN = process.env.LIFEMARK_APPS_DOMAIN ?? "apps.lifemarkai.com";
const ROOT_DOMAIN = process.env.LIFEMARK_ROOT_DOMAIN ?? "lifemarkai.com";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? `https://${ROOT_DOMAIN}`).replace(/\/+$/, "");

/**
 * Is the wildcard apps host actually able to serve HTTPS?
 *
 * This flag exists because of a real, measured failure. On 2026-08-01 sixty-two
 * projects carried `{slug}.apps.lifemarkai.com` deploy URLs and not one of them
 * loaded: publishing wrote the pretty hostname unconditionally, while DNS had no
 * `*.apps` record and Traefik had no router or certificate for it. The publish
 * reported success and the link was dead — the worst combination, because
 * nothing anywhere said so.
 *
 * A hostname only works when THREE things are true: DNS resolves, Traefik routes
 * it, and a valid certificate exists for it. DNS alone is not enough, and it is
 * the part people fix first, so this must not be inferred from a DNS lookup.
 * It is an explicit switch, off by default: claim the pretty URL only once
 * someone has verified it end to end.
 */
const APPS_DOMAIN_READY = process.env.LIFEMARK_APPS_DOMAIN_READY === "true";

/**
 * Path-based URL on the main domain. Unglamorous, and it works right now: the
 * certificate for lifemarkai.com is already valid, and `/preview-by-slug/:slug`
 * serves the stored build directly rather than redirecting, so there is no extra
 * hop and no loop. Note this deliberately does NOT point at `/app/:slug` — that
 * route reads `deployed_url` and redirects to it, so pointing it back at itself
 * would spin.
 */
function pathUrlFor(appSlug: string): string {
  return `${APP_URL}/preview-by-slug/${appSlug}`;
}

export interface BrandedDeployContext {
  projectName: string;
  projectId: string;
  /** Unique per-project slug (projects.app_slug). When present, produces a CLEAN
   *  slug-only host `{app_slug}.apps.lifemarkai.com`; otherwise falls back to the
   *  id-embedded host so routing never breaks. */
  appSlug?: string | null;
  brandedSubdomain?: string | null;
  brandedStatus?: string | null;
}

export function slugifyProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "app";
}

/**
 * Keep `slug` short enough that `slug + "-" + uuid` (36 chars) stays within the
 * 63-character DNS label limit, and never leaves a trailing hyphen.
 */
function shortSlug(name: string): string {
  return slugifyProjectName(name).slice(0, 20).replace(/-+$/g, "") || "app";
}

export function buildLifemarkDeployUrl(ctx: BrandedDeployContext): string {
  // Branded (white-label) host wins when active.
  if (ctx.brandedStatus === "active" && ctx.brandedSubdomain) {
    const label = ctx.appSlug || shortSlug(ctx.projectName);
    return `https://${label}.${ctx.brandedSubdomain}.${ROOT_DOMAIN}`;
  }
  // CLEAN slug-only host when the project has a unique app_slug
  // (e.g. https://my-store.apps.lifemarkai.com). Resolved by the slug host
  // rewrite → /preview-by-slug/[slug].
  if (ctx.appSlug) {
    return APPS_DOMAIN_READY
      ? `https://${ctx.appSlug}.${APPS_DOMAIN}`
      : pathUrlFor(ctx.appSlug);
  }
  // No slug yet. The id-embedded host has the same prerequisites as the slug
  // host, so it is only used when the apps domain is actually ready; otherwise
  // fall back to a path built from the same id.
  return APPS_DOMAIN_READY
    ? `https://${shortSlug(ctx.projectName)}-${ctx.projectId}.${APPS_DOMAIN}`
    : `${APP_URL}/preview/${ctx.projectId}`;
}

export function isBrandedDeployActive(ctx: BrandedDeployContext): boolean {
  return ctx.brandedStatus === "active" && !!ctx.brandedSubdomain;
}
