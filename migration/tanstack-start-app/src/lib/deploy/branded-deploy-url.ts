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
    return `https://${ctx.appSlug}.${APPS_DOMAIN}`;
  }
  // Fallback (no slug yet): id-embedded host so the exact-id host router still
  // resolves it. Never breaks routing for un-migrated projects.
  return `https://${shortSlug(ctx.projectName)}-${ctx.projectId}.${APPS_DOMAIN}`;
}

export function isBrandedDeployActive(ctx: BrandedDeployContext): boolean {
  return ctx.brandedStatus === "active" && !!ctx.brandedSubdomain;
}
