export type SeoPageCard = {
  path: string;
  title: string;
  description: string;
  ogImageUrl: string;
};

export function inferSeoPagePaths(files: Array<{ path?: string | null }>): string[] {
  const paths = new Set<string>(["/"]);
  for (const file of files) {
    const raw = (file.path ?? "").replace(/\\/g, "/");
    const match = raw.match(/(?:^|\/)(?:pages|routes)\/(.+)\.(?:tsx|jsx|ts|js)$/i);
    if (!match?.[1]) continue;
    let route = match[1]
      .replace(/\/index$/i, "")
      .replace(/^index$/i, "")
      .replace(/\[.+?\]/g, ":param");
    if (route.startsWith("api/") || route.includes("/_")) continue;
    if (!route.startsWith("/")) route = `/${route}`;
    if (route === "/") paths.add("/");
    else paths.add(route.replace(/\/$/, "") || "/");
  }
  return Array.from(paths).slice(0, 24);
}

export function mergeSeoPageCards(
  existing: SeoPageCard[] | undefined,
  paths: string[],
  defaults: { title: string; description: string; ogImageUrl: string },
): SeoPageCard[] {
  const byPath = new Map((existing ?? []).map((row) => [row.path, row]));
  return paths.map((path) => {
    const prev = byPath.get(path);
    return {
      path,
      title: prev?.title || (path === "/" ? defaults.title : `${defaults.title} · ${path}`),
      description: prev?.description || defaults.description,
      ogImageUrl: prev?.ogImageUrl || defaults.ogImageUrl,
    };
  });
}
