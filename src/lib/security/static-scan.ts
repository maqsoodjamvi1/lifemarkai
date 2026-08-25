/**
 * Static security pattern scan — shared between the SecurityPanel (which renders
 * findings in detail) and the EditorTopBar (which surfaces a count badge on the
 * "Review security" button inside the publish dropdown, matching Lovable's
 * red "9" badge).
 *
 * Pure function over file content. No network, no credits, fast enough to run
 * client-side every render of the editor layout.
 */

import type { ProjectFile } from "../../types/database.ts";

import { SECRET_PATTERNS, type SecretProvider } from "./detect-secret.ts";
import { remediationSummary, revocationFor } from "./secret-revocation.ts";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityFinding {
  severity: Severity;
  title: string;
  description: string;
  file: string;
  line?: number;
  snippet?: string;
  fix?: string;
  /** Set on leaked-credential findings — keys into SECRET_REVOCATION. */
  provider?: SecretProvider;
  /** Direct link to the provider page where the key is revoked. */
  revokeUrl?: string;
}

interface Pattern {
  pattern: RegExp;
  severity: Severity;
  title: string;
  description: string;
  fix: string;
}

/**
 * Non-credential patterns. Leaked API keys are NOT here — credentialFindings()
 * above sweeps all 25 provider formats from the shared catalog, so keeping
 * hand-written key regexes in this list would double-report every hit.
 */
export const SECURITY_PATTERNS: Pattern[] = [
  {
    pattern: /password\s*=\s*["'][^"']{4,}["']/i,
    severity: "high",
    title: "Hardcoded Password",
    description: "A password appears to be hardcoded in source code.",
    fix: "Use environment variables or a secrets manager.",
  },
  {
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html/,
    severity: "high",
    title: "XSS Risk: dangerouslySetInnerHTML",
    description: "Using dangerouslySetInnerHTML with unvalidated content can lead to Cross-Site Scripting attacks.",
    fix: "Sanitize HTML with DOMPurify before using dangerouslySetInnerHTML, or use a safer alternative.",
  },
  {
    pattern: /eval\s*\(/,
    severity: "high",
    title: "Dangerous: eval() usage",
    description: "eval() executes arbitrary code and is a major security risk if user input reaches it.",
    fix: "Avoid eval(). Use JSON.parse() for data parsing, or refactor the logic.",
  },
  {
    pattern: /localStorage\.setItem.*token|localStorage\.setItem.*password|sessionStorage\.setItem.*token/i,
    severity: "medium",
    title: "Sensitive Data in localStorage",
    description: "Tokens or passwords stored in localStorage are accessible via XSS attacks.",
    fix: "Use httpOnly cookies for sensitive tokens instead of localStorage.",
  },
  {
    pattern: /console\.(log|warn|error)\s*\(.*?(password|token|secret|key)/i,
    severity: "medium",
    title: "Sensitive Data Logged to Console",
    description: "Passwords, tokens, or keys appear to be logged to the console.",
    fix: "Remove console logs that include sensitive data before deploying.",
  },
  {
    pattern: /\.env[^.]/,
    severity: "medium",
    title: "Possible .env File Reference",
    description: "Source code appears to directly reference a .env file path.",
    fix: "Use process.env.VARIABLE_NAME instead of reading .env files directly in code.",
  },
  {
    pattern: /no-cors/i,
    severity: "low",
    title: "CORS Mode: no-cors",
    description: "Using fetch with mode:'no-cors' hides response details and can mask errors.",
    fix: "Configure proper CORS headers on your API instead of using no-cors mode.",
  },
  {
    pattern: /http:\/\/(?!localhost|127\.0\.0\.1)/,
    severity: "low",
    title: "Insecure HTTP URL",
    description: "Non-localhost HTTP URLs were found. Production traffic should use HTTPS.",
    fix: "Replace http:// with https:// for all production API endpoints.",
  },
];

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export interface StaticScanOptions {
  /**
   * The project is deployed publicly or pushed to a public repo. A leaked key
   * in a published project is not "should be moved to env" — it is "assume it
   * has already been collected", so credential findings escalate to critical
   * and their remediation leads with revocation.
   */
  published?: boolean;
}

/**
 * Sweep for leaked credentials using the SAME 25-provider catalog the chat
 * composer uses (detect-secret.ts).
 *
 * Before this, SECURITY_PATTERNS below carried its own four hand-written key
 * regexes, so a committed GitHub token, AWS access key, Supabase service-role
 * JWT, Slack token — twenty-one formats in all — were invisible here while the
 * identical string pasted into chat was caught immediately. One catalog, one
 * behaviour.
 *
 * Skips .env* files: those are the sanctioned place to hold a secret, and
 * flagging them trains people to ignore the panel.
 */
function credentialFindings(
  file: ProjectFile,
  lines: string[],
  published: boolean,
): SecurityFinding[] {
  if (/(^|\/)\.env(\.|$)/.test(file.path)) return [];
  const out: SecurityFinding[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    for (const spec of SECRET_PATTERNS) {
      if (!spec.re.test(lines[i])) continue;
      if (seen.has(spec.name)) continue;
      seen.add(spec.name);
      const g = revocationFor(spec.provider);
      out.push({
        severity: published && spec.live ? "critical" : spec.live ? "critical" : "medium",
        title: `Exposed ${spec.label}`,
        description:
          `A ${spec.label} is hardcoded in ${file.path}.` +
          (published && spec.live
            ? " This project is published, so treat the credential as already compromised."
            : ""),
        file: file.path,
        line: i + 1,
        // Never echo the credential itself into a finding — findings are
        // persisted, rendered, and can be exported.
        snippet: lines[i].replace(spec.re, "[redacted]").trim().slice(0, 120),
        fix: remediationSummary(spec.provider, { live: spec.live, published }),
        provider: spec.provider,
        revokeUrl: g?.consoleUrl,
      });
    }
  }
  return out;
}

export function staticScan(
  files: ProjectFile[],
  options: StaticScanOptions = {},
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const published = options.published === true;

  for (const file of files) {
    if (!file?.content) continue;
    const lines = file.content.split("\n");
    findings.push(...credentialFindings(file, lines, published));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, severity, title, description, fix } of SECURITY_PATTERNS) {
        if (pattern.test(line)) {
          const existing = findings.find((f) => f.title === title && f.file === file.path);
          if (!existing) {
            findings.push({
              severity,
              title,
              description,
              file: file.path,
              line: i + 1,
              snippet: line.trim().slice(0, 120),
              fix,
            });
          }
        }
      }
    }
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function countFindings(files: ProjectFile[]): number {
  return staticScan(files).length;
}
