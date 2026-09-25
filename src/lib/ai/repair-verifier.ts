import { buildEnvironmentGraph, classifyRepairFailure, type GraphFile, type RepairFailureLayer } from "./env-graph.ts";
import type { PreviewVerificationStep } from "./preview-verification-gate.ts";
import { isAllowedPackage } from "./package-allowlist.ts";

export interface RepairVerificationVerdict {
  accepted: boolean;
  originalLayer: RepairFailureLayer;
  inferredLayers: RepairFailureLayer[];
  changedFiles: string[];
  reasons: string[];
  constraintViolations: string[];
}

export type RepairConstraint = {
  id: string;
  description: string;
  check: (beforeFiles: GraphFile[], afterFiles: GraphFile[], changedFiles: string[]) => string | null;
};

const packageNames = (files: GraphFile[]) => {
  const manifest = files.find((file) => file.path === "package.json")?.content ?? "{}";
  try {
    const pkg = JSON.parse(manifest) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
    return new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  } catch {
    return new Set<string>();
  }
};

export const DEFAULT_REPAIR_CONSTRAINTS: RepairConstraint[] = [
  {
    id: "package-allowlist",
    description: "New dependencies must satisfy the enforced package allowlist.",
    check: (before, after) => {
      const oldNames = packageNames(before);
      const refused = [...packageNames(after)].filter((name) => !oldNames.has(name) && !isAllowedPackage(name));
      return refused.length ? `Patch adds refused dependencies: ${refused.join(", ")}.` : null;
    },
  },
  {
    id: "preserve-unrelated-files",
    description: "A repair may not delete existing files.",
    check: (before, after) => {
      const afterPaths = new Set(after.map((file) => file.path));
      const deleted = before.map((file) => file.path).filter((path) => !afterPaths.has(path));
      return deleted.length ? `Patch deletes existing files: ${deleted.join(", ")}.` : null;
    },
  },
  {
    id: "no-browser-secrets",
    description: "A repair may not introduce server secrets into browser source.",
    check: (before, after, changed) => {
      const beforeByPath = new Map(before.map((file) => [file.path, file.content ?? ""]));
      const leaked = after.filter((file) => changed.includes(file.path) && /\.(?:tsx?|jsx?)$/.test(file.path))
        .filter((file) => /(?:SERVICE_ROLE|SECRET_KEY|PRIVATE_KEY|API_SECRET)/.test(file.content ?? "") &&
          !/(?:SERVICE_ROLE|SECRET_KEY|PRIVATE_KEY|API_SECRET)/.test(beforeByPath.get(file.path) ?? ""))
        .map((file) => file.path);
      return leaked.length ? `Patch introduces secret references in browser files: ${leaked.join(", ")}.` : null;
    },
  },
];

function inferredLayers(path: string, before: string, after: string): RepairFailureLayer[] {
  const layers = new Set<RepairFailureLayer>();
  if (/(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|\.env)/.test(path)) layers.add("dependency");
  if (/(?:import|export|require\(|routes?|pages?)/i.test(`${path}\n${before}\n${after}`)) layers.add("internal-reference");
  if (/(?:vite|webpack|tsconfig|build|package\.json)/i.test(path)) layers.add("build");
  if (/\.(?:[cm]?[jt]sx?)$/i.test(path)) layers.add("build");
  if (/(?:server|entry|main|vite\.config|package\.json)/i.test(path)) layers.add("boot");
  if (/\.(?:tsx?|jsx?|html|css)$/i.test(path)) layers.add("browser-runtime");
  return [...layers];
}

const COMPATIBLE: Record<RepairFailureLayer, RepairFailureLayer[]> = {
  dependency: ["dependency"],
  "internal-reference": ["internal-reference"],
  build: ["build", "dependency", "internal-reference"],
  boot: ["boot", "build", "dependency"],
  "browser-runtime": ["browser-runtime", "internal-reference"],
};

/**
 * Independent patch check. It intentionally accepts no repair diagnosis—only
 * the original failure, the actual file diff, and optional fresh execution evidence.
 */
export function verifyRepairPatch(input: {
  originalErrors: string[];
  beforeFiles: GraphFile[];
  afterFiles: GraphFile[];
  evidence?: PreviewVerificationStep[];
  requireFreshEvidence?: boolean;
  constraints?: RepairConstraint[];
}): RepairVerificationVerdict {
  const before = new Map(input.beforeFiles.map((file) => [file.path, file.content ?? ""]));
  const after = new Map(input.afterFiles.map((file) => [file.path, file.content ?? ""]));
  const changedFiles = [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path));
  const originalLayer = classifyRepairFailure(input.originalErrors, buildEnvironmentGraph(input.beforeFiles)).layer;
  const inferred = new Set<RepairFailureLayer>();
  for (const path of changedFiles) for (const layer of inferredLayers(path, before.get(path) ?? "", after.get(path) ?? "")) inferred.add(layer);
  const reasons: string[] = [];
  const constraintViolations = (input.constraints ?? DEFAULT_REPAIR_CONSTRAINTS)
    .flatMap((constraint) => constraint.check(input.beforeFiles, input.afterFiles, changedFiles) ?? []);
  if (changedFiles.length === 0) reasons.push("Patch made no file changes.");
  if (![...inferred].some((layer) => COMPATIBLE[originalLayer].includes(layer))) {
    reasons.push(`Patch does not address the original ${originalLayer} failure layer.`);
  }
  if (input.requireFreshEvidence) {
    if (!input.evidence?.length) reasons.push("Fresh execution evidence is missing.");
    for (const step of input.evidence ?? []) {
      if (step.status !== "passed") reasons.push(`${step.name} ${step.status}: ${step.detail ?? "no passing evidence"}`);
    }
  }
  reasons.push(...constraintViolations);
  return { accepted: reasons.length === 0, originalLayer, inferredLayers: [...inferred], changedFiles, reasons, constraintViolations };
}
