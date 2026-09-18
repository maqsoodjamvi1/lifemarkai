/** TanStack Start's Vite plugin is ESM-only, including when a model omits the manifest type. */
export function ensureTanStackEsm<T extends { path: string; content?: string | null }>(files: T[]): T[] {
  return files.map((file) => {
    if (file.path.replace(/\\/g, "/").replace(/^\/+/, "") !== "package.json" || !file.content) return file;
    try {
      const pkg = JSON.parse(file.content);
      if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) return file;
      const start = pkg.dependencies?.["@tanstack/react-start"] ?? pkg.devDependencies?.["@tanstack/react-start"];
      if (typeof start !== "string" || pkg.type === "module") return file;
      return { ...file, content: `${JSON.stringify({ ...pkg, type: "module" }, null, 2)}\n` };
    } catch {
      return file;
    }
  });
}
