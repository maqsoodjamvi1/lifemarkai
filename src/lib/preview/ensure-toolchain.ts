/**
 * Keep the TypeScript toolchain present in a generated package.json.
 *
 * Its own module, with no imports, for the reason `prune-files.ts` is: the
 * repo's tests run under `node --test`, which cannot resolve the `@/…` alias
 * that `align-package-json.ts` uses — so anything living there is effectively
 * untestable. The pins are injectable for the same reason: callers pass the
 * scaffold's real dev set, tests use the defaults below, and neither has to
 * reach through an alias to do it.
 */

/**
 * Fallback pins, used when a caller does not supply the scaffold's own set.
 * Callers in the app pass BASE_APP_DEV_DEPENDENCIES so a bump there cannot
 * drift from what gets re-added here. `@types/node` is not in the base set
 * (it is TanStack-only), so it always carries the scaffold's value.
 */
export const DEFAULT_TOOLCHAIN_PINS: Record<string, string> = {
  typescript: "^5.5.0",
  "@types/react": "^18.3.1",
  "@types/react-dom": "^18.3.1",
  "@types/node": "^20.14.0",
};

/**
 * Put the TypeScript toolchain back into a generated package.json.
 *
 * WHY, MEASURED. The scaffolds already list `typescript` in
 * BASE_APP_DEV_DEPENDENCIES — but the model rewrites package.json freehand on
 * most turns (see this file's header), and what comes back is its own idea of
 * the dependency list. A live project checked in production had 40 dependencies
 * and 9 devDependencies, `typescript` not among them, while still shipping a
 * `tsconfig.json`. Since `npm install` in the sandbox reconciles node_modules
 * DOWN to package.json, the compiler the base image ships was then pruned out
 * of the container: `node_modules/.bin/tsc: No such file or directory` on a
 * TypeScript project.
 *
 * `alignGeneratedPackageJson` cannot fix this. It is a version aligner and by
 * design only rewrites pins for packages already listed; nothing in the
 * pipeline ADDS a missing devDependency. The same hole means the generated
 * app's own `build` script would fail with "tsc: not found" if anyone ran it.
 *
 * The type packages are not optional extras. Running `tsc` on a React project
 * without `@types/react` does not produce fewer diagnostics — it produces
 * hundreds of useless ones about JSX and missing modules, which would bury the
 * real errors and feed the repair loop noise. Either the toolchain is complete
 * or the check is worse than not running at all.
 *
 * Only ever ADDS what is missing, at the pin the scaffold already uses.
 * Existing entries are left alone — realigning them is the other function's job.
 */
export function ensureTypecheckToolchain<
  T extends { path: string; content?: string | null },
>(files: T[], pins: Record<string, string> = DEFAULT_TOOLCHAIN_PINS): T[] {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "");
  const pkgIdx = files.findIndex((f) => norm(f.path) === "package.json");
  if (pkgIdx < 0 || files[pkgIdx].content == null) return files;

  const paths = files.map((f) => norm(f.path));
  const isTypeScript =
    paths.some((p) => /\.tsx?$/.test(p) && !/\.d\.ts$/.test(p)) ||
    paths.some((p) => /^tsconfig(\..+)?\.json$/.test(p));
  if (!isTypeScript) return files;

  let pkg: Record<string, unknown>;
  try {
    const parsed = JSON.parse(files[pkgIdx].content as string);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return files;
    pkg = parsed as Record<string, unknown>;
  } catch {
    return files; // malformed package.json is reported elsewhere
  }

  const deps = (pkg.dependencies ?? {}) as Record<string, unknown>;
  const dev = { ...((pkg.devDependencies ?? {}) as Record<string, unknown>) };
  const have = (name: string) =>
    typeof deps[name] === "string" || typeof dev[name] === "string";

  const wanted: string[] = ["typescript"];
  if (paths.some((p) => /\.tsx$/.test(p)) || typeof deps.react === "string") {
    wanted.push("@types/react", "@types/react-dom");
  }
  // vite.config.ts in the TanStack scaffold imports `node:url`, so without node
  // types that config file alone accounts for a diagnostic on every run.
  if (paths.some((p) => /^vite\.config\.[cm]?ts$/.test(p))) {
    wanted.push("@types/node");
  }

  const added: string[] = [];
  for (const name of wanted) {
    if (have(name)) continue;
    const pin = pins[name];
    if (!pin) continue;
    dev[name] = pin;
    added.push(name);
  }
  if (added.length === 0) return files;

  const out = [...files];
  out[pkgIdx] = {
    ...files[pkgIdx],
    content: `${JSON.stringify({ ...pkg, devDependencies: dev }, null, 2)}\n`,
  } as T;
  return out;
}
