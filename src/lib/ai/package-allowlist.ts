/**
 * The package allowlist — ONE definition, used both to instruct the model and to
 * gate what actually reaches package.json.
 *
 * WHY THIS FILE EXISTS. There was a `PACKAGE_ALLOWLIST` before, but it was a
 * markdown string interpolated into system prompts and nothing else. No code ever
 * consulted it. Meanwhile `syncPackageJsonDeps` scanned generated imports and wrote
 * EVERY unrecognised specifier into `dependencies` as `"latest"`, from four call
 * sites. So a model that hallucinated `react-super-table` got
 * `"react-super-table": "latest"` in package.json, and the preview died in
 * `npm install` — 404, before installing anything, with the user seeing a broken
 * sandbox rather than a bad import. It was also a typosquat path: an invented name
 * one character off a real package installs whatever is on the registry.
 *
 * Worse, the prompt contradicted itself. It opened with "STRICT PACKAGE ALLOWLIST
 * — never import anything else" and closed with "ANY npm package may be added to
 * package.json". The model was reading the last line and behaving accordingly, so
 * the allowlist was not merely unenforced — it was overruled in its own text.
 *
 * The fix is a single machine-readable source. `renderPackageAllowlistPrompt()`
 * generates the prompt section FROM this data, and `resolveAllowedPackage()` gates
 * installs from the same data, so the two cannot disagree. Adding a package here
 * teaches the model about it and permits its install in one edit.
 *
 * Versions are not invented. Everything in the base scaffold inherits its pin from
 * `base-app-deps.ts` (which also feeds the pre-baked Modal preview image, so a pin
 * here matches what is genuinely installed). Curated extras that the scaffold does
 * not carry are allowed without a pin — see `UNPINNED` below.
 */

import { BASE_APP_DEPENDENCIES,BASE_APP_DEV_DEPENDENCIES } from "../preview/base-app-deps.ts";

/** Packages Node/the bundler provide; never installed. Mirrors npm-auto-install. */
export const NEVER_INSTALL = new Set(["react", "react-dom"]);

/**
 * Allowed but carrying no pin, because neither the scaffold nor the platform
 * installs them, and inventing a version range would be worse than omitting one.
 * These resolve to "latest" — acceptable ONLY because the name is explicitly
 * vetted here. An unvetted name is refused outright, which is the actual
 * protection.
 */
const UNPINNED = "latest";

export interface AllowlistEntry {
  /** Exact package name, or a prefix rule ending in `*`. */
  name: string;
  /** Semver range written into package.json, or `UNPINNED`. */
  version: string;
  /** Section heading in the rendered prompt. */
  group: string;
  /** Guidance appended after the name in the rendered prompt. */
  note?: string;
  /** Write into devDependencies rather than dependencies. */
  dev?: boolean;
  /** Omit from the rendered prompt (installable, not worth prompt tokens). */
  hidden?: boolean;
}

/** Turn a `Record<name, version>` into entries under one prompt group. */
function fromRecord(
  record: Record<string, string>,
  group: string,
  opts: { dev?: boolean; hidden?: boolean; notes?: Record<string, string> } = {},
): AllowlistEntry[] {
  return Object.entries(record).map(([name, version]) => ({
    name,
    version,
    group,
    dev: opts.dev,
    hidden: opts.hidden,
    note: opts.notes?.[name],
  }));
}

/**
 * The allowlist. Order controls the order of groups in the rendered prompt.
 */
export const PACKAGE_ALLOWLIST_ENTRIES: AllowlistEntry[] = [
  // ── The scaffold's own stack: already installed in every new app and baked
  // into the preview image, so these are free to use and cannot 404.
  ...fromRecord(BASE_APP_DEPENDENCIES, "Installed in every new app (shadcn/ui stack)", {
    notes: {
      "lucide-react": 'icons — named imports only: import { Home } from "lucide-react"',
      "date-fns": "date formatting — NOT moment.js",
      recharts: "charts — NOT chart.js, NOT d3 unless explicitly requested",
      zod: "validation — pair with react-hook-form via @hookform/resolvers",
      "@tanstack/react-query": "server state",
      "framer-motion": "animations",
      sonner: "toasts",
    },
  }),
  ...fromRecord(BASE_APP_DEV_DEPENDENCIES, "Build tooling (already configured)", {
    dev: true,
    hidden: true,
  }),

  // ── TanStack Start apps. Pins match tanstack-start-scaffold.ts exactly.
  {
    name: "@tanstack/react-start",
    version: "^1.168.0",
    group: "TanStack Start apps (the default framework)",
    note: "SSR + server functions. Prefer over react-router-dom for new apps.",
  },
  {
    name: "@tanstack/react-router",
    version: "^1.170.0",
    group: "TanStack Start apps (the default framework)",
    note: "file-based routing in src/routes/",
  },

  // ── Backend + payments. supabase-js pin matches the platform's own dependency.
  {
    name: "@supabase/supabase-js",
    version: "^2.45.0",
    group: "Backend & payments",
    note: "the ONLY database/auth client — use the shared src/lib/supabase.ts client",
  },
  {
    name: "@stripe/stripe-js",
    version: UNPINNED,
    group: "Backend & payments",
    note: "client-side Stripe only; never put a secret key in app code",
  },

  // ── State & utilities. zustand pin matches the platform's own dependency.
  { name: "zustand", version: "^4.5.2", group: "State & utilities", note: "global state" },
  {
    name: "uuid",
    version: UNPINNED,
    group: "State & utilities",
    note: "import { v4 as uuidv4 } — client-side IDs only",
  },

  // ── Prefix rules. A trailing * allows any package under the namespace: the
  // scaffold pins ~17 Radix primitives explicitly, and importing an 18th
  // (@radix-ui/react-progress) is legitimate rather than a hallucination.
  {
    name: "@radix-ui/react-*",
    version: UNPINNED,
    group: "Headless UI primitives",
    note: "any Radix primitive; the common ones are pre-installed",
  },
  {
    name: "@capacitor/*",
    version: UNPINNED,
    group: "Mobile export (iOS/Android)",
    note: "@capacitor/core at runtime; cli/android/ios are devDependencies",
  },
];

/** Prefix rules, precomputed. */
const PREFIX_RULES = PACKAGE_ALLOWLIST_ENTRIES.filter((e) => e.name.endsWith("*")).map((e) => ({
  prefix: e.name.slice(0, -1),
  entry: e,
}));

const EXACT_RULES = new Map(
  PACKAGE_ALLOWLIST_ENTRIES.filter((e) => !e.name.endsWith("*")).map((e) => [e.name, e]),
);

export type AllowlistDecision =
  | { allowed: true; version: string; dev: boolean; matchedBy: string }
  | { allowed: false };

/**
 * Decide whether a package may be written into package.json, and at what version.
 *
 * `name` must already be a bare package name (`@scope/pkg` or `pkg`) with any
 * subpath stripped — `extractImportedPackages` does that.
 */
export function resolveAllowedPackage(name: string): AllowlistDecision {
  const exact = EXACT_RULES.get(name);
  if (exact) {
    return { allowed: true, version: exact.version, dev: exact.dev ?? false, matchedBy: exact.name };
  }
  for (const { prefix, entry } of PREFIX_RULES) {
    if (name.startsWith(prefix) && name.length > prefix.length) {
      return { allowed: true, version: entry.version, dev: entry.dev ?? false, matchedBy: entry.name };
    }
  }
  return { allowed: false };
}

/** Convenience predicate. */
export function isAllowedPackage(name: string): boolean {
  return resolveAllowedPackage(name).allowed;
}

/**
 * Render the allowlist as the prompt section the models read.
 *
 * Generated from the same entries `resolveAllowedPackage` enforces, so the prompt
 * can neither advertise a package the installer will refuse nor hide one it
 * accepts. The closing paragraph states the real policy — the old text ended by
 * saying any package could be added, which contradicted its own opening line and
 * is what the models actually followed.
 */
export function renderPackageAllowlistPrompt(): string {
  const groups: string[] = [];
  const seen = new Set<string>();

  for (const entry of PACKAGE_ALLOWLIST_ENTRIES) {
    if (entry.hidden || seen.has(entry.group)) continue;
    seen.add(entry.group);
    const members = PACKAGE_ALLOWLIST_ENTRIES.filter((e) => e.group === entry.group && !e.hidden);
    const lines = members.map((m) => `- ${m.name}${m.note ? ` — ${m.note}` : ""}`);
    groups.push(`### ${entry.group}:\n${lines.join("\n")}`);
  }

  return [
    "## ⛔ STRICT PACKAGE ALLOWLIST — import only from this list.",
    "",
    ...groups,
    "",
    "### Prefer these over heavier alternatives:",
    "- fetch instead of axios",
    "- native JS instead of lodash",
    "- date-fns instead of moment",
    "- Tailwind instead of styled-components / MUI / antd",
    "",
    "### This list is ENFORCED, not advisory.",
    "Imports of anything outside it are refused at install time: the package is NOT",
    "added to package.json, so the import fails to resolve and the preview breaks.",
    "Tailwind needs no import (classes only). React and react-dom are always present.",
    "If a task genuinely needs a package that is not listed, build it with what IS",
    "listed, and say what you would have used in your `message` — do not import it.",
  ].join("\n");
}

/**
 * A names-only version of the allowlist, for prompts that need the constraint but
 * not the tutorial (auto-fix, patch mode). Same data, so it cannot drift from what
 * the installer accepts — which is the whole point of having it here rather than
 * hand-written per prompt.
 */
export function renderPackageAllowlistCompact(): string {
  const names = PACKAGE_ALLOWLIST_ENTRIES.filter((e) => !e.hidden && !e.dev).map((e) => e.name);
  return [
    "## Package rules (ENFORCED)",
    "- Prefer packages already in the project's package.json.",
    `- Allowed: ${names.join(", ")}. Tailwind is classes-only; react/react-dom always present.`,
    "- Anything else is refused at install time and will NOT resolve — never import it,",
    "  and never invent a package name. Solve the problem with what is listed.",
  ].join("\n");
}
