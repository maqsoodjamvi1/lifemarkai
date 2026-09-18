/**
 * Independent repair verifier (RETRACE).
 *
 * A separate check that never sees the repair agent's diagnosis. It reconstructs
 * what problem a patch appears to solve from the diff + fresh execution
 * evidence, then compares that reconstruction with the original failure.
 * Plausible patches that pass a narrow check but do not address the original
 * issue are rejected.
 */
import { fingerprintError } from "./failure-fingerprint.ts";
import {
  classifyPreviewFailureLayer,
  layerForError,
  type PreviewFailureLayer,
} from "./env-graph.ts";

export interface FileDiff {
  path: string;
  before: string;
  after: string;
}

export interface ReconstructedIssue {
  layer: PreviewFailureLayer | null;
  summary: string;
  signals: string[];
}

export interface RepairVerifierVerdict {
  accepted: boolean;
  reconstructed: ReconstructedIssue;
  originalLayer: PreviewFailureLayer | null;
  remainingOriginal: number;
  mismatch: string | null;
  falseGreen: boolean;
}

const PACKAGE_NAME_RE = /"([^"]+)":\s*"/g;

export function computeFileDiffs(
  before: Array<{ path: string; content?: string | null }>,
  after: Array<{ path: string; content?: string | null }>,
): FileDiff[] {
  const previous = new Map(before.map((file) => [file.path.replace(/\\/g, "/"), file.content ?? ""]));
  const diffs: FileDiff[] = [];
  const seen = new Set<string>();
  for (const file of after) {
    const path = file.path.replace(/\\/g, "/");
    seen.add(path);
    const next = file.content ?? "";
    const prev = previous.get(path);
    if (prev === undefined) {
      diffs.push({ path, before: "", after: next });
    } else if (prev !== next) {
      diffs.push({ path, before: prev, after: next });
    }
  }
  for (const [path, prev] of previous) {
    if (!seen.has(path)) diffs.push({ path, before: prev, after: "" });
  }
  return diffs;
}

function changedLines(before: string, after: string): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before.split(/\r?\n/));
  const afterSet = new Set(after.split(/\r?\n/));
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of afterSet) {
    if (!beforeSet.has(line) && line.trim()) added.push(line);
  }
  for (const line of beforeSet) {
    if (!afterSet.has(line) && line.trim()) removed.push(line);
  }
  return { added, removed };
}

function packageNames(content: string): Set<string> {
  const names = new Set<string>();
  PACKAGE_NAME_RE.lastIndex = 0;
  for (const match of content.matchAll(PACKAGE_NAME_RE)) names.add(match[1]);
  return names;
}

export function reconstructIssueFromDiff(diffs: FileDiff[]): ReconstructedIssue {
  const votes: Record<PreviewFailureLayer, number> = {
    dependency: 0,
    "internal-reference": 0,
    build: 0,
    boot: 0,
    "browser-runtime": 0,
  };
  const signals: string[] = [];

  for (const diff of diffs) {
    const path = diff.path.toLowerCase();
    const { added, removed } = changedLines(diff.before, diff.after);
    const delta = [...added, ...removed].join("\n");

    if (path.endsWith("package.json")) {
      const beforePkgs = packageNames(diff.before);
      const afterPkgs = packageNames(diff.after);
      const changed = [...afterPkgs].filter((name) => !beforePkgs.has(name))
        .concat([...beforePkgs].filter((name) => !afterPkgs.has(name)));
      if (changed.length > 0) {
        votes.dependency += 3;
        signals.push(`package.json: ${changed.slice(0, 6).join(", ")}`);
      }
    }
    if (/\.env(?:\.local|example)?$/.test(path) || /import\.meta\.env|process\.env/.test(delta)) {
      votes.dependency += 2;
      signals.push(`${diff.path}: environment binding`);
    }
    if (
      /from\s+['"]|export\s+|createFileRoute|createLazyFileRoute|Route\s*=/.test(delta) ||
      /src\/routes\//.test(path)
    ) {
      votes["internal-reference"] += 2;
      signals.push(`${diff.path}: import/export/route`);
    }
    if (/vite\.config|tsconfig|tailwind\.config|postcss\.config/.test(path) || /TS\d{4}|satisfies |as const/.test(delta)) {
      votes.build += 2;
      signals.push(`${diff.path}: build/config`);
    }
    if (/server\.(ts|js)|entry\.server|app\.config|listen\(|port/.test(path + delta)) {
      votes.boot += 2;
      signals.push(`${diff.path}: server boot`);
    }
    if (
      /useEffect|onClick|addEventListener|#root|document\.|window\.|catch\s*\(/.test(delta) ||
      /\.(tsx|jsx)$/.test(path)
    ) {
      votes["browser-runtime"] += 1;
      signals.push(`${diff.path}: runtime UI`);
    }
  }

  const ranked = (Object.entries(votes) as Array<[PreviewFailureLayer, number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const layer = ranked[0]?.[0] ?? null;
  return {
    layer,
    summary: layer
      ? `Patch appears to address a ${layer} failure (${signals.slice(0, 4).join("; ") || "no strong signal"}).`
      : "Patch does not reconstruct a functional failure.",
    signals,
  };
}

function originalStillPresent(
  originalFailures: Array<{ message: string }>,
  remainingErrors: string[],
): number {
  let count = 0;
  for (const original of originalFailures) {
    const identity = fingerprintError(original.message, "validation");
    if (
      remainingErrors.some((message) => {
        if (message === original.message) return true;
        return fingerprintError(message, "validation").fingerprint === identity.fingerprint;
      })
    ) {
      count += 1;
    }
  }
  return count;
}

/**
 * `repairAgentDiagnosis` is accepted only so callers can prove it is ignored.
 * The verdict is a function of original failure + diff + remaining errors.
 */
export function verifyRepairIndependently(input: {
  originalFailures: Array<{ type?: string; message: string }>;
  diffs: FileDiff[];
  remainingErrors: string[];
  repairAgentDiagnosis?: string;
}): RepairVerifierVerdict {
  void input.repairAgentDiagnosis;
  const originalLayer = input.originalFailures.length > 0
    ? classifyPreviewFailureLayer(input.originalFailures)
    : null;
  const reconstructed = reconstructIssueFromDiff(input.diffs);
  const remainingOriginal = originalStillPresent(input.originalFailures, input.remainingErrors);
  const remainingClean = input.remainingErrors.length === 0;

  if (input.originalFailures.length === 0) {
    return {
      accepted: remainingClean,
      reconstructed,
      originalLayer,
      remainingOriginal,
      mismatch: remainingClean ? null : "fresh errors without an original failure to reconstruct",
      falseGreen: false,
    };
  }

  if (input.diffs.length === 0) {
    return {
      accepted: false,
      reconstructed,
      originalLayer,
      remainingOriginal,
      mismatch: "no patch to reconstruct the original failure from",
      falseGreen: remainingClean,
    };
  }

  if (remainingOriginal > 0) {
    return {
      accepted: false,
      reconstructed,
      originalLayer,
      remainingOriginal,
      mismatch: "original failure still present in fresh execution evidence",
      falseGreen: false,
    };
  }

  const layerMatch =
    reconstructed.layer != null &&
    originalLayer != null &&
    (reconstructed.layer === originalLayer ||
      input.originalFailures.some((error) => layerForError(error) === reconstructed.layer));

  if (!layerMatch) {
    return {
      accepted: false,
      reconstructed,
      originalLayer,
      remainingOriginal,
      mismatch: `reconstructed ${reconstructed.layer ?? "nothing"} does not match original ${originalLayer}`,
      falseGreen: remainingClean,
    };
  }

  if (!remainingClean) {
    return {
      accepted: false,
      reconstructed,
      originalLayer,
      remainingOriginal,
      mismatch: "fresh execution evidence is not clean",
      falseGreen: false,
    };
  }

  return {
    accepted: true,
    reconstructed,
    originalLayer,
    remainingOriginal: 0,
    mismatch: null,
    falseGreen: false,
  };
}
