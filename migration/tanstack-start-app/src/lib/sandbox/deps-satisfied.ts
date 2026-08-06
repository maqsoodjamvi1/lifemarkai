/**
 * Decide whether a sandbox's already-installed node_modules provably satisfies
 * the project's package.json — i.e. whether `npm install` would be a no-op.
 *
 * WHY THIS EXISTS
 *
 * The sandbox base image ships `node_modules` pre-installed at the app path:
 * 301MB, 28,199 files, in a shared read-only layer. Every cold boot then ran
 * `npm install` anyway. The container probes for the prebuilt tree already —
 * `[ -d node_modules ] && echo LM_PREBUILT` — but the answer only changed the
 * progress *string* from "Installing dependencies" to "Reconciling
 * dependencies". The install ran either way.
 *
 * Even in the perfect case that is not free. npm re-resolves the root, then
 * reifies, which means stat'ing all 28,199 files to diff them against disk,
 * inside a container capped at one CPU. It is the single largest phase of a
 * first preview, and for a freshly generated app it is usually pure overhead:
 * the scaffold's dependencies are exactly the set the image was built from.
 *
 * WHY EXACT EQUALITY, NOT SEMVER SATISFACTION
 *
 * The tempting version of this compares each requested range against the
 * installed version and skips when every range is satisfied. That needs a
 * semver implementation, and — worse — it is wrong in the direction that
 * costs the user their preview: a range can be satisfied by what is on disk
 * while npm would still have work to do (a transitive dependency changed, a
 * package is present but not linked, an optional dep is missing).
 *
 * Exact key-and-spec equality against the package.json the image was actually
 * built from answers a narrower question with certainty: is this the same
 * dependency set npm already resolved? If yes, running it again cannot change
 * anything. If anything at all differs — one extra package, one changed
 * caret, one removed dev dependency (npm PRUNES, so a subset is real work) —
 * we fall through and install. Fail closed, always.
 */

export interface DepsComparison {
  /** True only when running npm install provably cannot change node_modules. */
  satisfied: boolean;
  /** Human-readable reason, for the boot log. Always set. */
  reason: string;
}

type DepMap = Record<string, string>;

function mergedDeps(pkg: unknown): DepMap | null {
  if (!pkg || typeof pkg !== "object") return null;
  const p = pkg as Record<string, unknown>;
  const out: DepMap = {};
  // `peerDependencies` deliberately excluded: npm does not install them into
  // the tree the same way, and including them would make the comparison
  // stricter than reality without making it safer.
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const section = p[field];
    if (section === undefined || section === null) continue;
    if (typeof section !== "object" || Array.isArray(section)) return null; // malformed
    for (const [name, spec] of Object.entries(section as Record<string, unknown>)) {
      if (typeof spec !== "string") return null; // malformed
      // Last field wins on a duplicate name, matching npm's own precedence
      // closely enough for a conservative equality check — and a duplicate
      // across dependencies/devDependencies is itself unusual enough that
      // falling through to a real install is the right outcome.
      out[name] = spec.trim();
    }
  }
  return out;
}

function parse(json: string | null | undefined): unknown {
  if (!json || !json.trim()) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * @param baselineJson  The package.json that was present in the container
 *                      BEFORE the project's files were uploaded — i.e. the one
 *                      the image's node_modules was installed from. Read it
 *                      before the upload overwrites it.
 * @param projectJson   The package.json being uploaded, AFTER every patch pass
 *                      (toolchain pins, tailwind plugins, auto-installed
 *                      imports) has already mutated it. Comparing before those
 *                      run would skip an install those passes just made
 *                      necessary.
 * @param hasNodeModules Whether the container actually has a node_modules
 *                      directory. Without one there is nothing to satisfy.
 */
export function dependenciesAlreadySatisfied(
  baselineJson: string | null | undefined,
  projectJson: string | null | undefined,
  hasNodeModules: boolean,
): DepsComparison {
  if (!hasNodeModules) {
    return { satisfied: false, reason: "no node_modules in the image" };
  }
  const baseline = mergedDeps(parse(baselineJson));
  if (!baseline) {
    return { satisfied: false, reason: "could not read the image's package.json" };
  }
  const project = mergedDeps(parse(projectJson));
  if (!project) {
    return { satisfied: false, reason: "could not read the project's package.json" };
  }

  const baseNames = Object.keys(baseline).sort();
  const projNames = Object.keys(project).sort();

  const added = projNames.filter((n) => !(n in baseline));
  // A REMOVED package is not a free pass. `npm install` reconciles downward as
  // well as upward, so a project asking for a subset makes npm delete the
  // extras — which on overlayfs means whiteouts across potentially thousands
  // of files. That is more work than the matching case, not less, so it must
  // not be mistaken for "nothing to do".
  const removed = baseNames.filter((n) => !(n in project));
  const changed = projNames.filter((n) => n in baseline && baseline[n] !== project[n]);

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    return {
      satisfied: true,
      reason: `all ${projNames.length} dependencies match the prebuilt tree`,
    };
  }

  const parts: string[] = [];
  if (added.length) parts.push(`${added.length} added (${added.slice(0, 3).join(", ")})`);
  if (changed.length) parts.push(`${changed.length} changed (${changed.slice(0, 3).join(", ")})`);
  if (removed.length) parts.push(`${removed.length} removed (${removed.slice(0, 3).join(", ")})`);
  return { satisfied: false, reason: parts.join(", ") };
}
