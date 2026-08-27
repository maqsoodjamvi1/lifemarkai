/**
 * Deterministic repair — the free tier below the model ladder.
 *
 * Two proven fixers already existed and ran ONLY on the build path
 * (validation-service), so a build that slipped past them — or a repair model
 * that introduced a fresh broken import — went straight to a paid model for a
 * defect a string rewrite fixes in microseconds. The fingerprint report says
 * this is not hypothetical: unresolved-local-import fingerprints are among the
 * most repeated in repair_outcomes, and "every repeated repair is a missing
 * normalizer" is this repo's standing rule.
 *
 * This module packages those fixers for the REPAIR path:
 *
 *   1. normalizeProjectImports — repoints an import whose target exists under
 *      another path (`./Card` written where `../components/Card.tsx` lives).
 *      Strictly a specifier rewrite; file contents are otherwise untouched.
 *   2. ensureCommonGeneratedSupportFiles — creates or extends generated
 *      support files (ui stubs, lib/types, lib/utils, contexts) so an import
 *      of something that exists nowhere resolves to a real module instead of
 *      crashing the whole app opaquely inside react-dom.
 *
 * Scope discipline, because a deterministic pass that overreaches is worse
 * than none:
 *
 *   - It runs ONLY when at least one error is in the class these fixers can
 *     address (unresolved local import / missing module / missing export).
 *     Runtime crashes, type mismatches and logic bugs pass through untouched —
 *     rewriting files on those signals would be guessing with extra steps.
 *   - It never RENAMES a file. ensureCommonGeneratedSupportFiles may rename
 *     `.ts` → `.tsx` when it finds JSX; on the build path that is fine (the
 *     set is fresh), but on the repair path the old row would survive in
 *     project_files and the sandbox as a duplicate module. If the support pass
 *     renames anything, its output is discarded and only the import rewrite
 *     survives.
 *   - It is idempotent: a second run over its own output changes nothing, so
 *     the caller can gate on "did anything change" without loop risk.
 *
 * The caller records an attempt with model "deterministic" so repair_outcomes
 * and the fingerprint report show exactly how many rounds the free tier
 * absorbed — the credit saving is measured, not assumed.
 */

import { normalizeProjectImports } from "../preview/normalize-imports.ts";
import { ensureCommonGeneratedSupportFiles } from "./generated-support-files.ts";
import { syncProjectDependencies } from "../verify/dependency-gate.ts";

export interface RepairableFile {
  path: string;
  content?: string | null;
  language?: string;
}

/**
 * The error classes the fixers can actually address. Matches all four message
 * shapes the gates emit for them:
 *   - typecheck-gate:  `src/App.tsx:4 — imports "./X", but no such file exists…`
 *   - export-contract: `src/App.tsx imports "./X", but no such file exists…`
 *   - export-contract: `"name" is imported by src/App.tsx but is not exported from…`
 *   - sandbox tsc:     `TS2307: Cannot find module './X'` / `TS2305: … has no exported member`
 */
const FIXABLE_ERROR_RE =
  /imports "|is imported by .+ but is not exported|TS2307|TS2305|Cannot find module|Failed to resolve import/;

export function hasDeterministicallyFixableErrors(errors: readonly string[]): boolean {
  return errors.some((e) => FIXABLE_ERROR_RE.test(e));
}

export interface DeterministicRepairResult<T extends RepairableFile> {
  files: T[];
  /** Paths whose content this pass rewrote. */
  changedPaths: string[];
  /** Paths this pass created that did not exist before. */
  createdPaths: string[];
}

function untouched<T extends RepairableFile>(files: T[]): DeterministicRepairResult<T> {
  return { files, changedPaths: [], createdPaths: [] };
}

export function deterministicRepair<T extends RepairableFile>(
  files: T[],
  errors: readonly string[],
): DeterministicRepairResult<T> {
  if (!hasDeterministicallyFixableErrors(errors)) return untouched(files);

  const before = new Map(files.map((f) => [f.path, f.content ?? ""]));

  // Pass 1 — repoint imports whose target exists under another path.
  let out: T[] = normalizeProjectImports(files);

  // Pass 2 — create/extend generated support files for what still resolves
  // nowhere. The helper requires string content; entries without it (binary
  // placeholders, null-content rows) are carried through unchanged.
  const eligible = out.filter((f): f is T & { content: string } => typeof f.content === "string");
  const rest = out.filter((f) => typeof f.content !== "string");
  const supported = ensureCommonGeneratedSupportFiles(eligible);

  // Rename guard: every pre-existing path must still be present. A rename on
  // the repair path leaves the old row alive as a duplicate module, so a pass
  // that renamed anything forfeits its output entirely.
  const supportedPaths = new Set(supported.map((f) => f.path));
  const renamed = eligible.some((f) => !supportedPaths.has(f.path));
  if (!renamed) out = [...supported, ...rest];

  // Pass 3 — libraries. An import of an ALLOWED npm package (recharts, a Radix
  // primitive, zustand…) that is missing from package.json is the library
  // twin of a missing local file: the sandbox reports it as TS2307 / "Failed
  // to resolve import" and a paid round used to rediscover it. Written at the
  // allowlist's pinned version — the same pins the preview image is built
  // from. Refused packages are NOT touched here: their fix is a code rewrite,
  // and findDependencyIssues turns each into a precise, located error for the
  // model instead. (dependency-gate.ts)
  out = syncProjectDependencies(out).files;

  const changedPaths: string[] = [];
  const createdPaths: string[] = [];
  for (const f of out) {
    const prev = before.get(f.path);
    if (prev === undefined) createdPaths.push(f.path);
    else if ((f.content ?? "") !== prev) changedPaths.push(f.path);
  }
  if (changedPaths.length === 0 && createdPaths.length === 0) return untouched(files);
  return { files: out, changedPaths, createdPaths };
}
