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

import { BASE_APP_DEPENDENCIES, BASE_APP_DEV_DEPENDENCIES } from "./base-app-deps.ts";

/** TanStack Start's Vite plugin requires Vite 7+; the SPA scaffold pins 5. */
const TANSTACK_VITE_PIN = "^7.0.0";

/**
 * Lowest version a range can resolve to. `^1.1.2` → [1,1,2]. Anything we cannot
 * parse (a git URL, `latest`, a complex range) returns null and is left alone.
 */
function minVersion(range: string): [number, number, number] | null {
  const m = /^[\^~>=\s]*(\d+)\.(\d+)\.(\d+)/.exec(range.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isBelow(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/**
 * Our pins are a FLOOR, not an override.
 *
 * The first version replaced every version we happened to have an opinion
 * about, which meant a plain Vite project got 26 rewrites on its first build
 * turn — `react-router-dom ^6.30.1 → ^6.28.0`, `typescript ^5.8.3 → ^5.5.0`,
 * `vite ^5.4.19 → ^5.4.0` and so on. Every one of those is a DOWNGRADE inside
 * the same major: harmless to resolution, but it rewrites package.json under
 * the user on turn one, throws away pins that `lovable-vite-scaffold.ts` says
 * were read out of a real Lovable export rather than guessed, and triggers a
 * pointless reinstall in the sandbox.
 *
 * The actual failure this function exists to prevent is a version resolving
 * BELOW what the rest of the tree needs — `vaul@^0.9.4` next to React 19 aborts
 * `npm install` with ERESOLVE and the preview never boots. That is a floor
 * check, so this is a floor check. A newer version than ours is the model being
 * current, and is left exactly as written.
 */
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
    const floor = minVersion(pin);
    const actual = minVersion(version);
    if (!floor || !actual || !isBelow(actual, floor)) continue;
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
  const deps = (root.dependencies ?? {}) as Record<string, unknown>;
  const dev = (root.devDependencies ?? {}) as Record<string, unknown>;

  // TanStack Start's Vite plugin peers on `vite >= 7`, while the base dev set
  // pins vite ^5 for the plain SPA scaffold. Decide which app this is BEFORE
  // aligning, and skip `vite` for TanStack projects — aligning first and
  // restoring afterwards produced a self-cancelling pair of entries
  // ("vite: ^7 → ^5", "vite: ^5 → ^7"), which made `changed` permanently
  // non-empty and rewrote package.json on turns where nothing had changed.
  //
  // The check reads BOTH sections: a model that files the build-time plugin
  // host under devDependencies is making a defensible choice, and looking only
  // at `dependencies` meant those projects were quietly downgraded to vite ^5 —
  // producing the exact ERESOLVE this function exists to prevent.
  const isTanStack =
    typeof deps["@tanstack/react-start"] === "string" ||
    typeof dev["@tanstack/react-start"] === "string";

  const devPins = isTanStack
    ? Object.fromEntries(
        Object.entries(BASE_APP_DEV_DEPENDENCIES).filter(([name]) => name !== "vite"),
      )
    : BASE_APP_DEV_DEPENDENCIES;

  alignSection(root.dependencies, BASE_APP_DEPENDENCIES, changed);
  alignSection(root.devDependencies, devPins, changed);

  if (isTanStack && typeof dev.vite === "string" && dev.vite !== TANSTACK_VITE_PIN) {
    changed.push(`vite: ${dev.vite} → ${TANSTACK_VITE_PIN}`);
    dev.vite = TANSTACK_VITE_PIN;
    root.devDependencies = dev;
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
