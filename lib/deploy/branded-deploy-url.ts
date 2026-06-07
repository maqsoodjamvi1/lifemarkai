/**
 * Build Lifemark-hosted deploy URLs, honoring active workspace branded subdomains
 * (migration 049 — {app}.{subdomain}.lifemarkai.app).
 */

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

export function buildLifemarkDeployUrl(ctx: BrandedDeployContext): string {
  const slug = slugifyProjectName(ctx.projectName);
  if (ctx.brandedStatus === "active" && ctx.brandedSubdomain) {
    return `https://${slug}.${ctx.brandedSubdomain}.lifemarkai.app`;
  }
  return `https://${slug}-${ctx.projectId.slice(0, 8)}.lifemarkai.app`;
}

export function isBrandedDeployActive(ctx: BrandedDeployContext): boolean {
  return ctx.brandedStatus === "active" && !!ctx.brandedSubdomain;
}
