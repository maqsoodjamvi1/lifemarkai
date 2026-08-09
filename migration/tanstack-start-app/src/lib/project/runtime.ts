export type ProjectRuntime = "static" | "framework";

export function runtimeForFramework(framework?: string | null): ProjectRuntime {
  return framework === "static" || framework === "html" ? "static" : "framework";
}

export function isStaticProject(
  framework: string | null | undefined,
  files: Array<{ path: string }>,
): boolean {
  if (runtimeForFramework(framework) === "static") return true;
  const paths = files.map((file) => file.path.replace(/\\/g, "/").replace(/^\.\//, ""));
  const hasHtml = paths.includes("index.html");
  const hasPackageRuntime = paths.some((path) => path === "package.json" || /vite\.config\./.test(path));
  return hasHtml && !hasPackageRuntime;
}

export function resolveProjectRuntime(
  runtime: ProjectRuntime | null | undefined,
  framework: string | null | undefined,
  files: Array<{ path: string }>,
): ProjectRuntime {
  if (runtime === "static" || runtime === "framework") return runtime;
  return isStaticProject(framework, files) ? "static" : "framework";
}
