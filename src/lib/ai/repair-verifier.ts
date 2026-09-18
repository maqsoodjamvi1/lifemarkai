import { buildEnvironmentGraph, classifyRepairFailure, type GraphFile, type RepairFailureLayer } from "./env-graph.ts";
import type { PreviewVerificationStep } from "./preview-verification-gate.ts";

export interface RepairVerificationVerdict {
  accepted: boolean;
  originalLayer: RepairFailureLayer;
  inferredLayers: RepairFailureLayer[];
  changedFiles: string[];
  reasons: string[];
}

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
}): RepairVerificationVerdict {
  const before = new Map(input.beforeFiles.map((file) => [file.path, file.content ?? ""]));
  const after = new Map(input.afterFiles.map((file) => [file.path, file.content ?? ""]));
  const changedFiles = [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path));
  const originalLayer = classifyRepairFailure(input.originalErrors, buildEnvironmentGraph(input.beforeFiles)).layer;
  const inferred = new Set<RepairFailureLayer>();
  for (const path of changedFiles) for (const layer of inferredLayers(path, before.get(path) ?? "", after.get(path) ?? "")) inferred.add(layer);
  const reasons: string[] = [];
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
  return { accepted: reasons.length === 0, originalLayer, inferredLayers: [...inferred], changedFiles, reasons };
}
