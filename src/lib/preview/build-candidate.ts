import { getSandboxProvider, isSandboxEnabled, type SandboxFile, type CandidateBuildResult } from "../sandbox/index.ts";

const active = new Set<string>();

export function needsFrameworkBuild(files: Array<{ path: string; content?: string | null }>): boolean {
  const fromSource = files.some((file) =>
    /\.[cm]?[jt]sx?$/.test(file.path) &&
    /(?:from\s*|import\s*)["']@tanstack\/react-(?:start|router)(?:["'/])/.test(file.content ?? ""),
  );
  const manifest = files.find((file) => file.path === "package.json");
  try {
    const pkg = JSON.parse(manifest?.content ?? "{}");
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Boolean(deps["@tanstack/react-start"] || deps["@tanstack/react-router"]) || fromSource;
  } catch {
    return fromSource;
  }
}

/** Pre-commit unknowns must block. Post-commit unknowns must not roll back a staged-verified app. */
export function frameworkBuildVerdict(
  build: CandidateBuildResult,
  options: { committed: boolean },
): { passed: boolean; errors: string[]; message: string } {
  if (build.available) {
    return {
      passed: build.passed,
      errors: build.passed ? [] : build.errors,
      message: build.passed
        ? "Build verified ✓ — ready to preview."
        : options.committed
          ? "The activated changes did not build; the last working revision was restored."
          : "The proposed changes did not build; your working preview was preserved.",
    };
  }
  const reason = build.reason ?? "Candidate build unavailable.";
  if (options.committed) {
    return {
      passed: true,
      errors: [],
      message: "Build confirmation could not re-run; your saved changes were kept.",
    };
  }
  return {
    passed: false,
    errors: [reason],
    message: "Build verification could not complete; your working preview was preserved.",
  };
}

export async function buildCandidateInSandbox(
  sandboxId: string,
  files: SandboxFile[],
): Promise<CandidateBuildResult> {
  const unavailable = (reason: string): CandidateBuildResult => ({ available: false, passed: false, errors: [], reason });
  if (!sandboxId || !isSandboxEnabled()) return unavailable("Open the preview first so candidate verification can use its installed dependencies.");
  if (active.has(sandboxId)) return unavailable("Another candidate build is already running for this preview.");
  active.add(sandboxId);
  try {
    const provider = getSandboxProvider();
    if (!provider.buildCandidate) return unavailable("This preview provider does not support isolated candidate builds.");
    return await provider.buildCandidate(sandboxId, files);
  } catch {
    return unavailable("Could not reach the preview's candidate build environment.");
  } finally {
    active.delete(sandboxId);
  }
}
