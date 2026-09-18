/**
 * Cluster generation-attempt failures into defect families.
 *
 * MLflow Automatic Issue Detection groups traces by Correctness, Latency,
 * Execution, Adherence, Relevance and Safety. Here those buckets map onto the
 * failure families already seen in LifeMarkAI first-boot: missing exports,
 * fabricated imports, invalid packages, preview timeouts, and so on.
 *
 * Clustering is what makes a repeated preview failure a template/orchestration
 * bug instead of a one-off log line.
 */
import { fingerprintError, fingerprintValidation, type FailureIdentity } from "./failure-fingerprint.ts";

export type FailureFamily =
  | "missing-export"
  | "fabricated-import"
  | "undeclared-file"
  | "missing-file"
  | "undeclared-package"
  | "invalid-package"
  | "missing-route"
  | "undeclared-edge"
  | "preview-timeout"
  | "typecheck"
  | "build"
  | "adherence"
  | "safety"
  | "other";

export type IssueDimension =
  | "correctness"
  | "latency"
  | "execution"
  | "adherence"
  | "relevance"
  | "safety";

export interface ClusteredFailure {
  family: FailureFamily;
  dimension: IssueDimension;
  count: number;
  fingerprint: string;
  label: string;
  sample: string;
}

const FAMILY_DIMENSION: Record<FailureFamily, IssueDimension> = {
  "missing-export": "correctness",
  "fabricated-import": "correctness",
  "undeclared-file": "adherence",
  "missing-file": "correctness",
  "undeclared-package": "adherence",
  "invalid-package": "execution",
  "missing-route": "correctness",
  "undeclared-edge": "adherence",
  "preview-timeout": "latency",
  typecheck: "correctness",
  build: "execution",
  adherence: "adherence",
  safety: "safety",
  other: "relevance",
};

export function classifyFailureFamily(input: {
  type?: string;
  message: string;
}): FailureFamily {
  const type = (input.type ?? "").toLowerCase();
  const message = input.message.toLowerCase();

  if (type === "undeclared_file" || type === "forbidden_tanstack_entry" || /not listed in project-contract/.test(message)) {
    return "undeclared-file";
  }
  if (type === "missing_contract_file" || type === "missing_module" || /no such file exists|was never generated/.test(message)) {
    return "missing-file";
  }
  if (type === "missing_contract_export" || type === "undeclared_named_import" || type === "undeclared_default_import" || /must export |is not exported|has no exported member/.test(message)) {
    return "missing-export";
  }
  if (type === "undeclared_dependency_edge") return "undeclared-edge";
  if (type === "disallowed_package" || /not on the install allowlist/.test(message)) return "invalid-package";
  if (type === "undeclared_package") return "undeclared-package";
  if (type === "missing_contract_route" || type === "route_missing_createfileroute" || /createfileroute/.test(message)) {
    return "missing-route";
  }
  if (/timeout|timed out|etimedout|preview hung/.test(message)) return "preview-timeout";
  if (/ts\d{4}|typecheck|cannot find name/.test(message)) return "typecheck";
  if (/vite build|production build|failed to compile/.test(message)) return "build";
  if (/secret|api key|service.role|credential leak/.test(message)) return "safety";
  if (/ghost|fabricated|does not declare/.test(message)) return "fabricated-import";
  return "other";
}

export function clusterFailures(
  errors: Array<{ type?: string; message: string; file?: string | null }>,
): ClusteredFailure[] {
  const buckets = new Map<string, ClusteredFailure>();
  for (const error of errors) {
    const family = classifyFailureFamily(error);
    const identity: FailureIdentity = error.type
      ? fingerprintValidation({ type: error.type, message: error.message, file: error.file })
      : fingerprintError(error.message, family === "typecheck" ? "typecheck" : family === "build" ? "build" : "validation");
    const key = `${family}:${identity.fingerprint}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    buckets.set(key, {
      family,
      dimension: FAMILY_DIMENSION[family],
      count: 1,
      fingerprint: identity.fingerprint,
      label: identity.label,
      sample: error.message.slice(0, 240),
    });
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

export function clusterSummary(clusters: ClusteredFailure[]): {
  families: FailureFamily[];
  topFamily: FailureFamily | null;
  dimensions: IssueDimension[];
} {
  const families = [...new Set(clusters.map((item) => item.family))];
  return {
    families,
    topFamily: clusters[0]?.family ?? null,
    dimensions: [...new Set(clusters.map((item) => item.dimension))],
  };
}

/** Fields safe for recordEvent (arrays are dropped by the sanitizer). */
export function attemptClusterFields(
  errors: Array<{ type?: string; message: string; file?: string | null }>,
): { topFamily: string | null; familyCount: number; families: string } {
  const summary = clusterSummary(clusterFailures(errors));
  return {
    topFamily: summary.topFamily,
    familyCount: summary.families.length,
    families: summary.families.join(","),
  };
}
