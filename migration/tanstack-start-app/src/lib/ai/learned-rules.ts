/**
 * Learned rules — LifemarkAI's own "tuning from builds" flywheel.
 *
 * Lovable's prompt quality compounds because failures at scale feed back into
 * guidance. We replicate the mechanism on our own data: recent health findings
 * and verification failures for a project are classified into known failure
 * classes, and the recurring ones are injected into the next build prompt as
 * concrete prevention rules. Zero AI cost — pure classification over rows we
 * already store (health_findings, self-verify failures).
 */

export type FailureClass =
  | "dangling-import"
  | "undefined-data"
  | "syntax"
  | "style-contrast"
  | "routing"
  | "env-secrets"
  | "hook-misuse";

interface FindingLike {
  title?: string | null;
  detail?: string | null;
}

const CLASSIFIERS: Array<{ cls: FailureClass; re: RegExp }> = [
  { cls: "dangling-import", re: /does not exist|missing component|not exported|failed to resolve|export mismatch|dangling import|imported from/i },
  { cls: "undefined-data", re: /reading '\w+'|of undefined|of null|\.map\b.*undefined|undefined is not|cannot read propert/i },
  { cls: "syntax", re: /syntaxerror|unexpected token|transform failed|failed to compile|unterminated|parse error/i },
  { cls: "style-contrast", re: /contrast|white on white|unreadable|invisible text|text-white.*bg-white/i },
  { cls: "routing", re: /no routes matched|useNavigate|router|<Route\b|404 for route|BrowserRouter/i },
  { cls: "env-secrets", re: /env var|VITE_[A-Z_]+|secret|api key|missing credential/i },
  { cls: "hook-misuse", re: /invalid hook call|rendered more hooks|rules of hooks|useEffect.*dependency/i },
];

const PREVENTION: Record<FailureClass, string> = {
  "dangling-import":
    "Recent builds here shipped imports pointing at files or exports that don't exist. Before finishing, walk EVERY import you wrote and confirm the target file is emitted and exports that exact symbol.",
  "undefined-data":
    "Recent builds here crashed reading properties of undefined (usually .map on missing data). Initialize every list to [], guard data access at component boundaries, and make hooks return empty defaults, never undefined.",
  syntax:
    "Recent builds here failed to compile. Re-read your output as the compiler would — balanced braces/JSX tags, no truncated files, extensions matching content — before returning.",
  "style-contrast":
    "Recent builds here produced unreadable color combinations. Use only design-system tokens and verify text/background contrast in both light and dark renders.",
  routing:
    "Recent builds here broke routing. Every page you link must have a matching <Route>, and the router wrapper must exist exactly once at the entry point.",
  "env-secrets":
    "Recent builds here mishandled env vars or credentials. Read config only from the established env pattern in this project, and never hardcode secrets in source.",
  "hook-misuse":
    "Recent builds here violated the Rules of Hooks. Call hooks only at the top level of components, and keep effect dependency arrays complete and stable.",
};

export function classifyFailure(text: string): FailureClass | null {
  const t = (text ?? "").slice(0, 800);
  if (!t.trim()) return null;
  for (const { cls, re } of CLASSIFIERS) if (re.test(t)) return cls;
  return null;
}

/**
 * Build the "learned from this project's recent failures" prompt block, or
 * null when there's nothing recurring worth saying (needs ≥2 hits in a class —
 * a one-off is noise; a repeat is a pattern).
 */
export function buildLearnedRulesBlock(findings: FindingLike[]): string | null {
  const counts = new Map<FailureClass, number>();
  for (const f of findings) {
    const cls = classifyFailure(`${f.title ?? ""} ${f.detail ?? ""}`);
    if (cls) counts.set(cls, (counts.get(cls) ?? 0) + 1);
  }
  const recurring = Array.from(counts.entries())
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (recurring.length === 0) return null;
  return [
    "---",
    "# Learned From This Project's Recent Failures",
    "",
    "These exact failure patterns recurred in this project. Do not repeat them:",
    ...recurring.map(([cls, n]) => `- (${n}×) ${PREVENTION[cls]}`),
    "---",
  ].join("\n");
}
