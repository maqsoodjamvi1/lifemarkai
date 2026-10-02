import { createHash } from "node:crypto";

export interface RequirementAcceptanceCheck {
  id: string;
  label: string;
  alternatives: string[];
}

export interface RequirementAcceptancePack {
  id: string;
  checks: RequirementAcceptanceCheck[];
}

export interface RequirementAcceptanceResult {
  passed: boolean;
  passedCount: number;
  totalCount: number;
  failed: RequirementAcceptanceCheck[];
}

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

function singular(value: string): string {
  return value.endsWith("ies")
    ? `${value.slice(0, -3)}y`
    : value.endsWith("s") && !value.endsWith("ss")
      ? value.slice(0, -1)
      : value;
}

/**
 * Builds deterministic acceptance checks from the requirement clause of a
 * prompt. The pack is created by the evaluator and is never sent to the
 * generator or repair model.
 */
export function deriveRequirementAcceptancePack(prompt: string): RequirementAcceptancePack {
  const clause = prompt.match(/\bwith\b([\s\S]*?)(?:[.!?]|$)/i)?.[1] ?? "";
  const labels = clause
    .split(/\s*,\s*|\s+and\s+/i)
    .map((part) => normalize(part))
    .filter((part) => part.length >= 3)
    .slice(0, 12);
  const checks = labels.map((label, index) => {
    const words = label.split(" ");
    const singularLabel = words.map(singular).join(" ");
    return {
      id: `requirement-${index + 1}`,
      label,
      alternatives: [...new Set([label, singularLabel])],
    };
  });
  const fingerprint = JSON.stringify(checks.map(({ label, alternatives }) => ({ label, alternatives })));
  return {
    id: createHash("sha256").update(fingerprint).digest("hex").slice(0, 16),
    checks,
  };
}

/**
 * Grades generated output without an LLM judge. This is deliberately separate
 * from the five-step preview workflow: a healthy page can still omit a stated
 * feature and must not be reported as green.
 */
export function evaluateRequirementAcceptance(
  pack: RequirementAcceptancePack,
  generatedArtifact: string,
): RequirementAcceptanceResult {
  const haystack = normalize(generatedArtifact);
  const failed = pack.checks.filter(
    (check) => !check.alternatives.some((alternative) => haystack.includes(normalize(alternative))),
  );
  return {
    passed: pack.checks.length > 0 && failed.length === 0,
    passedCount: pack.checks.length - failed.length,
    totalCount: pack.checks.length,
    failed,
  };
}
