/**
 * The publish-time security gate — ONE definition, called by every publish path.
 *
 * WHY THIS FILE EXISTS. There were two ways to publish and only one of them was
 * gated. `routes/api/deploy.ts` ran scanProject + auditDependencies and refused on
 * critical findings with a 412. `lib/deploy/publish-from-chat.ts` talked to the
 * Netlify API itself and ran no scan at all — so "publish it" in chat shipped code
 * that the Publish button would have refused. Same product, same user, opposite
 * behaviour, decided by which surface they happened to use.
 *
 * The second bug was in the gate itself. It blocked only on
 * `severity === "critical"`, and NO PII rule can produce that severity — the
 * strongest are `high` (SSN, credit card) and the weakest is `low` (an email
 * address). So detection worked, reported honestly in the security panel, and then
 * never stopped a single deploy. A product that scans for card numbers and
 * publishes them anyway is worse than one that does not scan, because the scan
 * implies a promise.
 *
 * WHAT BLOCKS, AND WHY THAT LINE. Blocking every `high` finding would have made
 * `pii-email` — an email address in a seed file, which is often intentional — a
 * publish-stopper, and a gate people route around is not a gate. So:
 *
 *   critical (any kind)        → block. Hardcoded secrets live here.
 *   high + kind "pii"          → block. SSNs and card numbers. Publishing these
 *                                is a disclosure the user cannot take back.
 *   low/medium, anything else  → report, do not block.
 *
 * Both blocking classes are overridable by an explicit caller decision, because
 * the user may legitimately be shipping test data. The override is per-request and
 * never inferred.
 */

import { scanProject,type SecurityFinding } from "./scan.ts";
import { auditDependencies } from "./deps.ts";

export interface PublishGateFile {
  path: string;
  content: string;
  language?: string;
}

export interface PublishGateOptions {
  /** Caller explicitly accepted critical findings (e.g. user ticked the box). */
  allowCritical?: boolean;
  /** Caller explicitly accepted publishing detected personal data. */
  allowPii?: boolean;
}

export interface PublishGateResult {
  /** True when publishing must not proceed. */
  blocked: boolean;
  /** Everything the scan found, blocking or not — for the caller to surface. */
  findings: SecurityFinding[];
  /** Only the findings that caused the block. */
  blocking: SecurityFinding[];
  /** Which gate tripped, so the caller can ask for the right override. */
  reasons: Array<"critical" | "pii">;
  /** One sentence suitable for showing the user. */
  message: string;
}

/** High-severity personal data — the disclosure class, not the "email in a fixture" class. */
function isBlockingPii(finding: SecurityFinding): boolean {
  return finding.kind === "pii" && finding.severity === "high";
}

/**
 * Run the full publish scan and decide whether the deploy may proceed.
 *
 * Pure and synchronous: no network, no database. That keeps it cheap enough to run
 * on every publish path and trivial to assert against, which is the point —
 * a gate that is expensive to call is a gate that gets skipped.
 */
export function evaluatePublishGate(
  files: PublishGateFile[],
  opts: PublishGateOptions = {},
): PublishGateResult {
  const findings: SecurityFinding[] = [
    ...scanProject(files).findings,
    ...auditDependencies(files),
  ];

  const critical = findings.filter((f) => f.severity === "critical");
  const pii = findings.filter(isBlockingPii);

  const reasons: Array<"critical" | "pii"> = [];
  const blocking: SecurityFinding[] = [];

  if (critical.length > 0 && !opts.allowCritical) {
    reasons.push("critical");
    blocking.push(...critical);
  }
  if (pii.length > 0 && !opts.allowPii) {
    reasons.push("pii");
    blocking.push(...pii);
  }

  const parts: string[] = [];
  if (reasons.includes("critical")) {
    parts.push(
      `${critical.length} critical security finding${critical.length === 1 ? "" : "s"}`,
    );
  }
  if (reasons.includes("pii")) {
    parts.push(
      `${pii.length} instance${pii.length === 1 ? "" : "s"} of personal data (${[
        ...new Set(pii.map((f) => f.title)),
      ].join(", ")})`,
    );
  }

  return {
    blocked: blocking.length > 0,
    findings,
    blocking,
    reasons,
    message: parts.length
      ? `Publishing is blocked: ${parts.join(" and ")}. Review in the Security panel, or publish again explicitly accepting the risk.`
      : "",
  };
}

/** Shared 412 body so both publish paths report a block identically. */
export function publishGateResponseBody(result: PublishGateResult) {
  return {
    error: result.message,
    requiresSecurityReview: true,
    reasons: result.reasons,
    findings: result.blocking,
  };
}
