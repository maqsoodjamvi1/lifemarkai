/**
 * Static dependency / supply-chain audit (real replacement for the Security
 * Center's previously-hardcoded "Supply Chain" best-practice list).
 *
 * Pure and dependency-free: inspects a project's package.json + lockfile
 * presence and flags the supply-chain risks that don't need a network call —
 * unpinned/loose ranges, non-registry sources, missing lockfile, dependency
 * bloat, and a curated set of known-risky/deprecated packages. Returns findings
 * in the same shape as lib/security/scan.ts so the scan route can merge them.
 */

import type { SecurityFinding,Severity } from "./scan.ts";

interface ScanFile { path: string; content: string }

// Curated set of packages that are deprecated, abandoned, or historically
// compromised. Not exhaustive — a signal, not a substitute for `npm audit`.
const RISKY_PACKAGES: Record<string, { severity: Severity; why: string }> = {
  request: { severity: "medium", why: "deprecated (unmaintained since 2020); use fetch/undici/axios" },
  "left-pad": { severity: "low", why: "trivial package; the 2016 unpublish incident showed the risk of micro-deps" },
  "event-stream": { severity: "high", why: "historically compromised (bitcoin-stealing payload in a transitive dep)" },
  colors: { severity: "high", why: "author sabotage (infinite loop) in 1.4.44-1.4.1; pin to a safe version or use chalk" },
  faker: { severity: "medium", why: "author sabotage of the original package; use @faker-js/faker" },
  "node-ipc": { severity: "high", why: "protestware that wiped files on certain geolocations; avoid or pin carefully" },
  "flatmap-stream": { severity: "high", why: "malicious package from the event-stream incident" },
  coa: { severity: "medium", why: "hijacked release in 2021; ensure a pinned, known-good version" },
  rc: { severity: "medium", why: "hijacked release in 2021; ensure a pinned, known-good version" },
};

const LOCKFILES = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"];

function findLine(lines: string[], name: string): number {
  const needle = `"${name}"`;
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return 1;
}

/** Audit a project's dependency manifest. Returns [] when there is no package.json. */
export function auditDependencies(files: ScanFile[]): SecurityFinding[] {
  const pkgFile = files.find((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
  if (!pkgFile) return [];

  const findings: SecurityFinding[] = [];
  let pkg: Record<string, unknown>;
  try { pkg = JSON.parse(pkgFile.content || "{}"); } catch {
    return [{
      rule: "package-json-invalid", severity: "medium", kind: "dependency",
      title: "package.json is not valid JSON", file: pkgFile.path, line: 1,
      snippet: "package.json", recommendation: "Fix the JSON so tooling (installs, audits, CI) can parse it.",
    }];
  }

  const lines = (pkgFile.content || "").split("\n");
  const deps: Record<string, string> = {
    ...(pkg.dependencies as Record<string, string> ?? {}),
    ...(pkg.devDependencies as Record<string, string> ?? {}),
  };
  const depNames = Object.keys(deps);

  for (const [name, rawRange] of Object.entries(deps)) {
    const range = String(rawRange).trim();
    const line = findLine(lines, name);

    // Non-registry sources — a supply-chain risk (bypasses the registry + lockfile integrity).
    if (/^(git\+|git:|https?:|file:|github:|[\w-]+\/[\w-]+$)/.test(range) && !/^https?:\/\/registry\./.test(range)) {
      findings.push({
        rule: "dep-non-registry", severity: "high", kind: "dependency",
        title: `Non-registry dependency source: ${name}`, file: pkgFile.path, line,
        snippet: `"${name}": "${range}"`,
        recommendation: "Prefer versioned registry releases; git/URL/file sources skip integrity checks and can change under you.",
      });
      continue;
    }

    // Unpinned / floating ranges.
    if (range === "*" || range === "" || range.toLowerCase() === "latest" || range.toLowerCase() === "x" || /^>=?\s*0/.test(range)) {
      findings.push({
        rule: "dep-unpinned", severity: "high", kind: "dependency",
        title: `Unpinned dependency: ${name}`, file: pkgFile.path, line,
        snippet: `"${name}": "${range}"`,
        recommendation: `Pin ${name} to a specific version or a caret range (e.g. ^1.2.3) so builds are reproducible.`,
      });
    }

    // Known-risky / deprecated packages.
    const risky = RISKY_PACKAGES[name];
    if (risky) {
      findings.push({
        rule: "dep-risky-package", severity: risky.severity, kind: "dependency",
        title: `Known-risky dependency: ${name}`, file: pkgFile.path, line,
        snippet: `"${name}": "${range}"`,
        recommendation: risky.why,
      });
    }
  }

  // Missing lockfile — installs aren't reproducible and integrity isn't pinned.
  const hasLock = files.some((f) => LOCKFILES.some((l) => f.path === l || f.path.endsWith("/" + l)));
  if (!hasLock && depNames.length > 0) {
    findings.push({
      rule: "dep-no-lockfile", severity: "medium", kind: "dependency",
      title: "No lockfile committed", file: pkgFile.path, line: 1,
      snippet: "package.json (no package-lock.json / yarn.lock / pnpm-lock.yaml)",
      recommendation: "Commit a lockfile so installs are reproducible and dependency integrity is pinned.",
    });
  }

  // Dependency bloat — a larger attack surface.
  if (depNames.length > 80) {
    findings.push({
      rule: "dep-bloat", severity: "low", kind: "dependency",
      title: `Large dependency count (${depNames.length})`, file: pkgFile.path, line: 1,
      snippet: `${depNames.length} direct dependencies`,
      recommendation: "Review and prune unused dependencies — every package is attack surface and maintenance load.",
    });
  }

  return findings;
}
