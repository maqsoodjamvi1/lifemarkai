/**
 * Security + sensitive-data scanner (enterprise beachhead — Lovable Security
 * Center parity).
 *
 * Pure, dependency-free static scan over a project's files. Catches the three
 * things that actually bite AI-generated apps:
 *   1. Hardcoded provider secrets (the AI occasionally inlines a key).
 *   2. Risky exposure (service-role key or a secret behind a browser-exposed
 *      VITE_ var, eval of dynamic input).
 *   3. PII (emails, SSNs, credit cards) sitting in code/seed data.
 *
 * No false-positive-prone heuristics that need a parser — line-level regex with
 * placeholder/ENV-reference guards. Run server-side (scan route) or in CI.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export interface SecurityFinding {
  rule: string;
  severity: Severity;
  kind: "secret" | "risky" | "pii";
  title: string;
  file: string;
  line: number;
  /** Redacted snippet — never returns the full secret value. */
  snippet: string;
  recommendation: string;
}

export interface ScanResult {
  findings: SecurityFinding[];
  summary: Record<Severity, number> & { total: number };
}

interface ScanFile {
  path: string;
  content: string;
}

const SCANNABLE = /\.(tsx?|jsx?|mjs|cjs|json|env|local|txt|md|html|css|sql|ya?ml)$/i;
const isFrontend = (path: string) => /^src\/|^app\/|^components\/|^pages\/|\.(tsx|jsx)$/.test(path) && !/route\.|server|\.server\.|edge|functions\//.test(path);
const looksPlaceholder = (v: string) =>
  /^(your[-_ ]|xxx|placeholder|example|changeme|todo|<.*>|\$\{|process\.env|import\.meta\.env|deno\.env)/i.test(v) || /\*{3,}|x{6,}/i.test(v);

function redact(line: string): string {
  return line
    .replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1…")
    .replace(/(sk_(?:live|test)_[A-Za-z0-9]{4})[A-Za-z0-9]+/g, "$1…")
    .replace(/(AKIA[0-9A-Z]{4})[0-9A-Z]+/g, "$1…")
    .replace(/(AIza[0-9A-Za-z_-]{4})[0-9A-Za-z_-]+/g, "$1…")
    .trim()
    .slice(0, 160);
}

// ── Secret rules ─────────────────────────────────────────────────────────────
interface SecretRule { rule: string; severity: Severity; title: string; re: RegExp; rec: string }
const SECRET_RULES: SecretRule[] = [
  { rule: "openai-key", severity: "critical", title: "Hardcoded OpenAI API key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/, rec: "Move to a server-side secret/env var; never inline provider keys in code." },
  { rule: "anthropic-key", severity: "critical", title: "Hardcoded Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/, rec: "Move to a server-side secret; rotate the exposed key." },
  { rule: "stripe-secret", severity: "critical", title: "Hardcoded Stripe secret key", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/, rec: "Stripe secret keys must stay server-side; rotate immediately if committed." },
  { rule: "aws-access-key", severity: "critical", title: "Hardcoded AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/, rec: "Remove from code, rotate the key, use IAM roles or server-side secrets." },
  { rule: "google-api-key", severity: "high", title: "Hardcoded Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/, rec: "Restrict and move to a server-side secret; client-exposed keys must be domain-restricted." },
  { rule: "private-key", severity: "critical", title: "Private key material in source", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, rec: "Never commit private keys; rotate and store in a secret manager." },
  { rule: "jwt-service-role", severity: "critical", title: "Possible service-role JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, rec: "If this is a Supabase service_role JWT, it bypasses RLS — move server-side and rotate." },
];

const GENERIC_SECRET = /\b([A-Za-z0-9_]*(?:api[_-]?key|secret|token|password|passwd|client[_-]?secret|access[_-]?key))\b\s*[:=]\s*["'`]([^"'`]{12,})["'`]/i;

// ── PII rules ────────────────────────────────────────────────────────────────
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const CC_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/;

function luhnValid(digits: string): boolean {
  const n = digits.replace(/\D/g, "");
  if (n.length < 13 || n.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Scan a single project for secrets, risky exposure, and PII. */
export function scanProject(files: ScanFile[]): ScanResult {
  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();
  const push = (fnd: SecurityFinding) => {
    const key = `${fnd.rule}:${fnd.file}:${fnd.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(fnd);
  };

  for (const file of files) {
    if (!SCANNABLE.test(file.path)) continue;
    const lines = (file.content ?? "").split("\n");
    const frontend = isFrontend(file.path);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ln = i + 1;
      if (line.length > 4000) continue; // skip minified/data blobs

      // Secrets
      for (const r of SECRET_RULES) {
        if (r.re.test(line)) {
          push({ rule: r.rule, severity: r.severity, kind: "secret", title: r.title, file: file.path, line: ln, snippet: redact(line), recommendation: r.rec });
        }
      }
      const generic = GENERIC_SECRET.exec(line);
      if (generic && !looksPlaceholder(generic[2])) {
        push({ rule: "generic-secret", severity: "high", kind: "secret", title: `Hardcoded ${generic[1].toLowerCase()}`, file: file.path, line: ln, snippet: redact(line), recommendation: "Replace the literal with a server-side env var / secret reference." });
      }

      // Risky exposure
      if (/service_role|SERVICE_ROLE_KEY/.test(line) && frontend) {
        push({ rule: "service-role-client", severity: "critical", kind: "risky", title: "Service-role key referenced in client code", file: file.path, line: ln, snippet: redact(line), recommendation: "service_role bypasses RLS — use it only in server/edge code, never in the browser bundle." });
      }
      const viteSecret = /\bVITE_[A-Z0-9_]*(?:SECRET|PRIVATE|SERVICE_ROLE|PASSWORD)[A-Z0-9_]*\b/.exec(line);
      if (viteSecret) {
        push({ rule: "vite-exposed-secret", severity: "high", kind: "risky", title: "Secret behind a browser-exposed VITE_ var", file: file.path, line: ln, snippet: viteSecret[0], recommendation: "VITE_ vars are inlined into the client bundle — never put secrets there; keep them server-side." });
      }
      if (/\beval\s*\(/.test(line) && !/\/\//.test(line.split("eval")[0])) {
        push({ rule: "eval-usage", severity: "medium", kind: "risky", title: "Use of eval()", file: file.path, line: ln, snippet: redact(line), recommendation: "Avoid eval on any non-constant input — it's an injection vector." });
      }

      // PII (skip md docs and obvious example domains to cut noise)
      const isDoc = /\.md$/i.test(file.path);
      if (!isDoc) {
        const em = EMAIL.exec(line);
        if (em && !/@(example|test|sentry|email|domain|yourdomain|company)\.|@.*\.(test|local)\b/i.test(em[0]) && !looksPlaceholder(em[0])) {
          push({ rule: "pii-email", severity: "low", kind: "pii", title: "Email address in source/data", file: file.path, line: ln, snippet: em[0], recommendation: "If this is real user data, move it to the database, not source/seed files." });
        }
        if (SSN.test(line)) {
          push({ rule: "pii-ssn", severity: "high", kind: "pii", title: "Possible US SSN", file: file.path, line: ln, snippet: redact(line).replace(/\d(?=\d{2}-\d{4})/g, "•"), recommendation: "Never store SSNs in code; encrypt at rest and restrict access." });
        }
        const cc = CC_CANDIDATE.exec(line);
        if (cc && luhnValid(cc[0])) {
          push({ rule: "pii-credit-card", severity: "high", kind: "pii", title: "Possible credit-card number", file: file.path, line: ln, snippet: "•••• •••• •••• " + cc[0].replace(/\D/g, "").slice(-4), recommendation: "Never store raw card numbers — use a PCI-compliant processor (Stripe) token." });
        }
      }
    }
  }

  const summary = { critical: 0, high: 0, medium: 0, low: 0, total: findings.length } as ScanResult["summary"];
  for (const f of findings) summary[f.severity]++;
  // Highest severity first, then by file/line.
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
  return { findings, summary };
}
