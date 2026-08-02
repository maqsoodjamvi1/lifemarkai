/**
 * Force generated package.json versions back onto the pins we actually support.
 *
 * WHY. The model writes package.json freehand. It is *told* the pins (the
 * allowlist prompt is generated from `base-app-deps.ts`), but a prompt is not a
 * constraint: it copies a stale version out of its own training data, or keeps
 * a version from an earlier turn's file it was shown as context, and the result
 * is not a lint warning — it is a dead preview. `npm install` runs inside the
 * sandbox with default (npm 7+) strict peer resolution, so ONE package pinned to
 * a React-18-only major aborts the entire install with ERESOLVE before anything
 * is written, and the user sees a preview that never boots.
 *
 * That is not hypothetical: the base set moved to React 19 (see base-app-deps.ts
 * for why — whole-document hydration under browser extensions), and ten of the
 * packages in it have React-18-only majors still sitting in every model's
 * training data. `vaul@^0.9.4`, `react-day-picker@^8`, `next-themes@^0.3` and
 * friends all resolve fine on their own and all fail hard next to React 19.
 *
 * So: for every package WE own a pin for, our pin wins. Packages we do not pin
 * are left exactly as the model wrote them — this aligns versions, it does not
 * police the dependency list (`package-allowlist.ts` does that).
 */

import { BASE_APP_DEPENDENCIES, BASE_APP_DEV_DEPENDENCIES } from "@/lib/preview/base-app-deps";

/** TanStack Start's Vite plugin requires Vite 7+; the SPA scaffold pins 5. */
const TANSTACK_VITE_PIN = "^7.0.0";

function alignSection(
  section: unknown,
  pins: Record<string, string>,
  changed: string[],
): void {
  if (!section || typeof section !== "object" || Array.isArray(section)) return;
  const deps = section as Record<string, unknown>;
  for (const [name, version] of Object.entries(deps)) {
    const pin = pins[name];
    if (!pin || typeof version !== "string" || version === pin) continue;
    deps[name] = pin;
    changed.push(`${name}: ${version} → ${pin}`);
  }
}

export interface AlignResult {
  content: string;
  changed: string[];
}

/**
 * Rewrite a generated package.json so every package we pin carries our version.
 * Returns the input untouched when it is not parseable JSON — a malformed
 * package.json is a separate error that `validateGeneratedFiles` already
 * reports, and silently "fixing" it here would hide that.
 */
export function alignGeneratedPackageJson(content: string): AlignResult {
  let pkg: unknown;
  try {
    pkg = JSON.parse(content);
  } catch {
    return { content, changed: [] };
  }
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
    return { content, changed: [] };
  }

  const root = pkg as Record<string, unknown>;
  const changed: string[] = [];

  alignSection(root.dependencies, BASE_APP_DEPENDENCIES, changed);
  alignSection(root.devDependencies, BASE_APP_DEV_DEPENDENCIES, changed);

  // TanStack Start apps: the base dev pin (vite ^5) violates the plugin's
  // `vite >= 7` peer, which is its own ERESOLVE. Raise it only for those apps
  // so the plain Vite SPA scaffold keeps the version it was built against.
  const deps = (root.dependencies ?? {}) as Record<string, unknown>;
  if (typeof deps["@tanstack/react-start"] === "string") {
    const dev = (root.devDependencies ?? {}) as Record<string, unknown>;
    if (typeof dev.vite === "string" && dev.vite !== TANSTACK_VITE_PIN) {
      changed.push(`vite: ${dev.vite} → ${TANSTACK_VITE_PIN}`);
      dev.vite = TANSTACK_VITE_PIN;
      root.devDependencies = dev;
    }
  }

  if (changed.length === 0) return { content, changed };
  return { content: `${JSON.stringify(root, null, 2)}\n`, changed };
}

/**
 * `src/routeTree.gen.ts` is written by the `tanstackStart()` Vite plugin at dev
 * and build time. The model emits a hand-written stub of it anyway — a real
 * build shipped a 12-line file exporting only `type RouteTree`, while
 * `src/router.tsx` does `import { routeTree } from "./routeTree.gen"`. That
 * stub is worse than useless: it is overwritten in the sandbox (so it never
 * matches what runs), it shows up in the user's file tree as a file they must
 * not edit, and the static import checker reads it literally and reports
 * `named import { routeTree } … not exported` — a false positive that feeds the
 * self-repair prompt and has already caused the repair pass to rewrite
 * `src/routes/__root.tsx` into a broken state.
 *
 * The scaffold does not include this file. Neither should any generated set.
 */
export function stripGeneratedRouteTree<T extends { path: string }>(files: T[]): T[] {
  return files.filter(
    (f) => !/^src\/routeTree\.gen\.(ts|tsx|js|jsx)$/.test(f.path.replace(/\\/g, "/")),
  );
}
