#!/usr/bin/env node
/**
 * Emit docker/sandbox/package.json — the dependency set baked into the preview
 * sandbox image.
 *
 * WHY GENERATE IT: the image exists purely to make `npm install` a delta
 * reconcile instead of a cold network install, and that only works while the
 * baked versions match what the scaffold actually asks for. A hand-maintained
 * copy would drift the first time someone bumps a version in the scaffold, and
 * the failure is silent — installs quietly get slow again. Deriving it from the
 * same source files the generator uses means a version bump flows straight into
 * the next image build.
 *
 * The parse is deliberately literal: these four exports are flat
 * `Record<string, string>` object literals with a spread of the base set at the
 * top, so pulling `key: "value"` pairs out of each block is exact. Anything
 * unexpected (a computed key, a renamed export) throws instead of silently
 * emitting a short list.
 *
 *   node scripts/gen-sandbox-base-package.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Pull the `{ … }` body of `export const <name>` and read its string pairs. */
function readDepBlock(source, file, name) {
  const start = source.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`${file}: export ${name} not found`);
  const open = source.indexOf("{", start);
  if (open < 0) throw new Error(`${file}: ${name} has no object literal`);

  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`${file}: ${name} object literal is unterminated`);

  const body = source.slice(open + 1, end);
  const out = {};
  // `"@radix-ui/react-tabs": "^1.1.1",` and `zod: "^3.25.76",` are both valid
  // here — quoting is only required for names that aren't bare identifiers.
  const pair = /(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = pair.exec(body))) out[m[1] ?? m[2]] = m[3];
  if (Object.keys(out).length === 0) throw new Error(`${file}: ${name} parsed as empty`);
  return out;
}

const baseSrc = readFileSync(resolve(root, "src/lib/preview/base-app-deps.ts"), "utf8");
const viteSrc = readFileSync(
  resolve(root, "src/lib/templates/lovable-vite-scaffold.ts"),
  "utf8",
);

// Same precedence the scaffold itself applies: `{ ...BASE, …overrides }`.
const dependencies = {
  ...readDepBlock(baseSrc, "base-app-deps.ts", "BASE_APP_DEPENDENCIES"),
  ...readDepBlock(viteSrc, "lovable-vite-scaffold.ts", "LOVABLE_VITE_DEPENDENCIES"),
};
const devDependencies = {
  ...readDepBlock(baseSrc, "base-app-deps.ts", "BASE_APP_DEV_DEPENDENCIES"),
  ...readDepBlock(viteSrc, "lovable-vite-scaffold.ts", "LOVABLE_VITE_DEV_DEPENDENCIES"),
};

const sort = (o) =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

const pkg = {
  name: "lifemark-sandbox-base",
  private: true,
  version: "0.0.0",
  type: "module",
  // Both React majors are in play: the shared base pins 18, the Lovable-shaped
  // scaffold overrides to 19. Whichever a generated app asks for, npm resolves
  // the difference against what is already on disk rather than from scratch.
  dependencies: sort(dependencies),
  devDependencies: sort(devDependencies),
};

const outDir = resolve(root, "docker/sandbox");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

console.log(
  `docker/sandbox/package.json: ${Object.keys(pkg.dependencies).length} deps, ` +
    `${Object.keys(pkg.devDependencies).length} devDeps`,
);
