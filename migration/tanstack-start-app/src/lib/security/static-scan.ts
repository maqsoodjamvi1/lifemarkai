/**
 * Static security pattern scan — shared between the SecurityPanel (which renders
 * findings in detail) and the EditorTopBar (which surfaces a count badge on the
 * "Review security" button inside the publish dropdown, matching Lovable's
 * red "9" badge).
 *
 * Pure function over file content. No network, no credits, fast enough to run
 * client-side every render of the editor layout.
 */

import type { ProjectFile } from "@/types/database";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityFinding {
  severity: Severity;
  title: string;
  description: string;
  file: string;
  line?: number;
  snippet?: string;
  fix?: string;
}

interface Pattern {
  pattern: RegExp;
  severity: Severity;
  title: string;
  description: string;
  fix: string;
}

export const SECURITY_PATTERNS: Pattern[] = [
  {
    pattern: /sk-[a-zA-Z0-9]{20,}/,
    severity: "critical",
    title: "Exposed OpenAI API Key",
    description: "An OpenAI API key was found in your source code. Anyone who sees this code can use your API key.",
    fix: "Move this key to .env.local and use process.env.OPENAI_API_KEY instead.",
  },
  {
    pattern: /sk-ant-[a-zA-Z0-9\-_]{20,}/,
    severity: "critical",
    title: "Exposed Anthropic API Key",
    description: "An Anthropic API key was found in source code.",
    fix: "Move to .env.local and use process.env.ANTHROPIC_API_KEY.",
  },
  {
    pattern: /pk_live_[a-zA-Z0-9]{20,}/,
    severity: "critical",
    title: "Exposed Stripe Live Publishable Key",
    description: "A live Stripe publishable key is hardcoded. While publishable keys have limited scope, they should still be in environment variables.",
    fix: "Use process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.",
  },
  {
    pattern: /sk_live_[a-zA-Z0-9]{20,}/,
    severity: "critical",
    title: "Exposed Stripe Live Secret Key",
    description: "A live Stripe secret key is hardcoded. This gives full access to your Stripe account.",
    fix: "Move immediately to .env.local as STRIPE_SECRET_KEY and never commit this file.",
  },
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

export function staticScan(files: ProjectFile[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const file of files) {
    if (!file?.content) continue;
    const lines = file.content.split("\n");
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
