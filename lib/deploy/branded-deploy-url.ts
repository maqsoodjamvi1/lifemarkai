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
  const slug = shortSlug(ctx.projectName);
  if (ctx.brandedStatus === "active" && ctx.brandedSubdomain) {
    return `https://${slug}.${ctx.brandedSubdomain}.${ROOT_DOMAIN}`;
  }
  // Full project id as the resolvable suffix → exact lookup by the host router.
  return `https://${slug}-${ctx.projectId}.${APPS_DOMAIN}`;
}

export function isBrandedDeployActive(ctx: BrandedDeployContext): boolean {
  return ctx.brandedStatus === "active" && !!ctx.brandedSubdomain;
}
