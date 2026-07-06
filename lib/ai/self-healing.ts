// @ts-nocheck
/**
 * Self-Healing scan engine (Editor Intelligence P2 — docs/editor-intelligence/03 §1).
 *
 * Static, zero-AI-cost health checks over a project's `project_files`, persisted
 * into `health_findings` (migration 075). Reuses the existing correctness/quality
 * validators from lib/ai/code-parser.ts read-only, plus dependency, security and
 * performance heuristics. Fixes are proposed/applied separately (approval-gated)
 * via /api/projects/[id]/health.
 *
 * Invoked by:
 *  - GET  /api/health-scan                    (nightly cron over recent projects)
 *  - POST /api/projects/[id]/health {action:"scan"}  (on-demand from the panel)
 */

import {
  validateGeneratedFiles,
  assessGenerationQuality,
  type ParsedFile,
} from "@/lib/ai/code-parser";

export type HealthCategory =
  | "build"
  | "runtime"
  | "dependency"
  | "security"
  | "performance"
  | "accessibility";

export type HealthSeverity = "info" | "warning" | "error" | "critical";

export interface DetectedFinding {
  category: HealthCategory;
  severity: HealthSeverity;
  title: string;
  detail?: string;
  file_path?: string | null;
}

/** Hard cap so a pathological project can't explode the table in one scan. */
const MAX_FINDINGS_PER_SCAN = 100;

const CODE_FILE_RE = /\.(tsx?|jsx?|mjs|cjs|vue|svelte)$/;

/** Paths we never scan for secrets/perf: sanctioned secret stores + generated artifacts. */
function isExcludedPath(path: string): boolean {
  return (
    /(^|\/)\.env(\.|$)/.test(path) ||          // .env.local is the sanctioned secret store
    /(^|\/)node_modules\//.test(path) ||
    /(^|\/)(dist|build|\.next)\//.test(path) ||
    /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/.test(path)
  );
}

function languageFor(path: string): string {
  if (/\.tsx?$/.test(path)) return "typescript";
  if (/\.jsx?$/.test(path)) return "javascript";
  if (/\.json$/.test(path)) return "json";
  if (/\.css$/.test(path)) return "css";
  if (/\.html?$/.test(path)) return "html";
  if (/\.sql$/.test(path)) return "sql";
  return "plaintext";
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) Build — reuse the existing static validators read-only
// ─────────────────────────────────────────────────────────────────────────────

function buildChecks(files: ParsedFile[]): DetectedFinding[] {
  const findings: DetectedFinding[] = [];
  const seen = new Set<string>();

  // Pass files as their own "existing" set so new-project scaffold checks
  // (missing vite.config.ts etc.) don't fire against arbitrary saved projects.
  let correctness: ReturnType<typeof validateGeneratedFiles> = [];
  try {
    correctness = validateGeneratedFiles(files, files);
  } catch {
    /* validator crash must never fail a scan */
  }
  for (const err of correctness) {
    const file = err.file ?? err.path ?? null;
    const key = `${err.type}|${file ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      category: "build",
      severity: err.severity === "error" ? "error" : err.severity === "warning" ? "warning" : "info",
      title: `Build check: ${err.type.replace(/_/g, " ")}`,
      detail: err.message,
      file_path: file,
    });
  }

  // Quality gate — structural thinness. Informational for a standing scan
  // (it was designed as a generation gate), so downgrade to warning.
  let quality: ReturnType<typeof assessGenerationQuality> = [];
  try {
    quality = assessGenerationQuality(files, files);
  } catch {
    /* non-fatal */
  }
  for (const err of quality) {
    const file = err.file ?? err.path ?? null;
    const key = `quality:${err.type}|${file ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      category: "build",
      severity: "warning",
      title: `Quality check: ${err.type.replace(/_/g, " ")}`,
      detail: err.message,
      file_path: file,
    });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// (b) Dependency — package.json anti-patterns
// ─────────────────────────────────────────────────────────────────────────────

function dependencyChecks(files: ParsedFile[]): DetectedFinding[] {
  const findings: DetectedFinding[] = [];
  const pkgFile = files.find((f) => f.path === "package.json");
  if (!pkgFile) return findings;

  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  try {
    pkg = JSON.parse(pkgFile.content);
  } catch {
    return findings; // invalid JSON already reported by the build validator
  }
  if (!pkg || typeof pkg !== "object") return findings;

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const hasTsx = files.some((f) => /\.(tsx|jsx)$/.test(f.path) && !isExcludedPath(f.path));

  if (hasTsx && !("react" in deps)) {
    findings.push({
      category: "dependency",
      severity: "error",
      title: "React missing from package.json dependencies",
      detail:
        "The project contains .tsx/.jsx component files but package.json does not list `react` in dependencies or devDependencies. The app cannot build or run without it.",
      file_path: "package.json",
    });
  }

  for (const [name, version] of Object.entries(deps)) {
    if (typeof version === "string" && version.trim().toLowerCase() === "latest") {
      findings.push({
        category: "dependency",
        severity: "warning",
        title: `Dependency "${name}" pinned to "latest"`,
        detail:
          `"${name}": "latest" makes builds non-reproducible — any upstream release can break the app without a code change. Pin a semver range (e.g. "^18.3.0").`,
        file_path: "package.json",
      });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// (c) Security — hardcoded secrets + dangerous sinks
// ─────────────────────────────────────────────────────────────────────────────

const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bsk-[A-Za-z0-9_-]{16,}/, label: "API secret key (sk-…)" },
  { re: /\bpk_live_[A-Za-z0-9]{8,}/, label: "Stripe live key (pk_live…)" },
  { re: /\bAKIA[0-9A-Z]{12,}/, label: "AWS access key (AKIA…)" },
];

function securityChecks(files: ParsedFile[]): DetectedFinding[] {
  const findings: DetectedFinding[] = [];

  for (const file of files) {
    if (isExcludedPath(file.path)) continue;
    const content = file.content ?? "";
    if (!content) continue;

    for (const { re, label } of SECRET_PATTERNS) {
      if (re.test(content)) {
        findings.push({
          category: "security",
          severity: "critical",
          title: `Hardcoded secret: ${label}`,
          detail:
            `${file.path} appears to contain a hardcoded credential (${label}). Move it into .env.local and read it from import.meta.env / process.env — secrets committed to source are exposed to anyone with code access.`,
          file_path: file.path,
        });
      }
    }

    if (!CODE_FILE_RE.test(file.path)) continue;

    if (/password\s*=\s*["'][^"']+["']/i.test(content)) {
      findings.push({
        category: "security",
        severity: "error",
        title: "Hardcoded password in code",
        detail:
          `${file.path} assigns a literal password (password = "…"). Store credentials in .env.local or the backend, never in source code.`,
        file_path: file.path,
      });
    }

    if (content.includes("dangerouslySetInnerHTML")) {
      findings.push({
        category: "security",
        severity: "warning",
        title: "dangerouslySetInnerHTML usage",
        detail:
          `${file.path} uses dangerouslySetInnerHTML. If the HTML comes from user input or an API, this is an XSS vector — sanitize it (e.g. DOMPurify) or render as text.`,
        file_path: file.path,
      });
    }

    if (/\beval\s*\(/.test(content)) {
      findings.push({
        category: "security",
        severity: "error",
        title: "eval() usage",
        detail:
          `${file.path} calls eval(). Executing dynamic strings is a code-injection risk and blocks CSP hardening — replace with JSON.parse, a lookup table, or explicit logic.`,
        file_path: file.path,
      });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// (d) Performance — oversized files + eager image grids
// ─────────────────────────────────────────────────────────────────────────────

const LARGE_FILE_BYTES = 100 * 1024;

function performanceChecks(files: ParsedFile[]): DetectedFinding[] {
  const findings: DetectedFinding[] = [];

  for (const file of files) {
    if (isExcludedPath(file.path)) continue;
    const content = file.content ?? "";

    if (content.length > LARGE_FILE_BYTES) {
      findings.push({
        category: "performance",
        severity: "warning",
        title: "File exceeds 100KB",
        detail:
          `${file.path} is ${Math.round(content.length / 1024)}KB. Large source files slow bundling and often hide inlined data — split it into modules or move data to a fetched asset.`,
        file_path: file.path,
      });
    }

    if (!CODE_FILE_RE.test(file.path) && !/\.html?$/.test(file.path)) continue;

    const imgTags = content.match(/<img\b[^>]*>/gi) ?? [];
    if (imgTags.length >= 5) {
      const eager = imgTags.filter((tag) => !/loading\s*=\s*["']lazy["']/i.test(tag));
      if (eager.length > 0) {
        findings.push({
          category: "performance",
          severity: "warning",
          title: "Images missing loading=\"lazy\"",
          detail:
            `${file.path} renders ${imgTags.length} <img> tags and ${eager.length} of them load eagerly. Add loading="lazy" to below-the-fold images to cut initial page weight.`,
          file_path: file.path,
        });
      }
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// (e) Accessibility — static checks over JSX/HTML (fills the reserved
// 'accessibility' category; Lovable's SEO/AEO review covers the same ground)
// ─────────────────────────────────────────────────────────────────────────────

function accessibilityChecks(files: ParsedFile[]): DetectedFinding[] {
  const findings: DetectedFinding[] = [];

  for (const file of files) {
    if (isExcludedPath(file.path)) continue;
    if (!/\.(tsx|jsx|html?)$/.test(file.path)) continue;
    const content = file.content ?? "";
    if (!content) continue;

    // <img> without alt — the most common a11y failure and an SEO hit.
    const imgs = content.match(/<img\b[^>]*>/gi) ?? [];
    const missingAlt = imgs.filter((tag) => !/\balt\s*=/.test(tag)).length;
    if (missingAlt > 0) {
      findings.push({
        category: "accessibility",
        severity: "warning",
        title: `${missingAlt} image(s) missing alt text`,
        detail:
          `${file.path}: ${missingAlt} of ${imgs.length} <img> tags have no alt attribute. Screen readers announce these as unlabeled; search engines can't index them. Add alt="…" (or alt="" for purely decorative images).`,
        file_path: file.path,
      });
    }

    // Icon-only <button> with no accessible name.
    const buttons = content.match(/<button\b[^>]*>[\s\S]{0,80}?<\/button>/gi) ?? [];
    const unnamed = buttons.filter(
      (b) =>
        !/aria-label\s*=/.test(b) &&
        // no visible text content: strip tags, check remaining text
        b.replace(/<[^>]+>/g, "").trim().length === 0,
    ).length;
    if (unnamed > 0) {
      findings.push({
        category: "accessibility",
        severity: "warning",
        title: `${unnamed} icon-only button(s) without aria-label`,
        detail:
          `${file.path}: buttons containing only icons need aria-label="…" so screen-reader users know what they do.`,
        file_path: file.path,
      });
    }

    // Inputs without an associated label mechanism (heuristic).
    const inputs = content.match(/<input\b[^>]*>/gi) ?? [];
    const unlabeled = inputs.filter(
      (i) =>
        !/type\s*=\s*["'](hidden|submit|button|checkbox|radio)["']/.test(i) &&
        !/aria-label\s*=|aria-labelledby\s*=|placeholder\s*=|id\s*=/.test(i),
    ).length;
    if (unlabeled > 0) {
      findings.push({
        category: "accessibility",
        severity: "info",
        title: `${unlabeled} input(s) without label/aria-label/placeholder`,
        detail:
          `${file.path}: text inputs need an accessible name — a <label htmlFor>, aria-label, or at minimum a placeholder.`,
        file_path: file.path,
      });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan orchestration + persistence
// ─────────────────────────────────────────────────────────────────────────────

function findingKey(f: { category: string; title: string; file_path?: string | null }): string {
  return `${f.category}|${f.title}|${f.file_path ?? ""}`;
}

/** Run all static analyzers over a file set. Pure — no DB access. */
export function detectFindings(files: ParsedFile[]): DetectedFinding[] {
  const detected = [
    ...buildChecks(files),
    ...dependencyChecks(files),
    ...securityChecks(files),
    ...performanceChecks(files),
    ...accessibilityChecks(files),
  ];

  // De-dupe within the scan itself, then cap.
  const seen = new Set<string>();
  const unique: DetectedFinding[] = [];
  for (const f of detected) {
    const key = findingKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
    if (unique.length >= MAX_FINDINGS_PER_SCAN) break;
  }
  return unique;
}

/**
 * Scan one project and reconcile `health_findings`:
 *  - new issues       → insert as 'open'
 *  - still-present    → left untouched (keeps status/proposed_fix)
 *  - regressed        → previously 'fixed' rows re-opened
 *  - no longer found  → 'open' rows marked 'fixed'
 * Dismissed findings are never resurrected.
 */
export async function runHealthScan({
  supabase,
  projectId,
  userId,
}: {
  supabase: any;
  projectId: string;
  userId: string;
}): Promise<{ findings: number }> {
  const { data: fileRows, error: filesErr } = await supabase
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", projectId);
  if (filesErr) throw new Error(`health scan: failed to load files — ${filesErr.message}`);

  const files: ParsedFile[] = (fileRows ?? [])
    .filter((f: any) => typeof f.path === "string")
    .map((f: any) => ({
      path: f.path,
      content: f.content ?? "",
      language: f.language ?? languageFor(f.path),
    }));

  const detected = files.length > 0 ? detectFindings(files) : [];
  const detectedKeys = new Set(detected.map(findingKey));

  // Existing non-dismissed findings for reconciliation (check-then-insert dedupe).
  const { data: existingRows } = await supabase
    .from("health_findings")
    .select("id, category, title, file_path, status")
    .eq("project_id", projectId)
    .neq("status", "dismissed");
  const existing = existingRows ?? [];
  const existingByKey = new Map<string, { id: string; status: string }>();
  for (const row of existing) existingByKey.set(findingKey(row), { id: row.id, status: row.status });

  // 1) Insert new findings; re-open regressed ('fixed') ones.
  const toInsert: any[] = [];
  const toReopen: string[] = [];
  for (const f of detected) {
    const prior = existingByKey.get(findingKey(f));
    if (!prior) {
      toInsert.push({
        project_id: projectId,
        user_id: userId,
        category: f.category,
        severity: f.severity,
        title: f.title,
        detail: f.detail ?? null,
        file_path: f.file_path ?? null,
        status: "open",
      });
    } else if (prior.status === "fixed") {
      toReopen.push(prior.id);
    }
    // 'open' / 'fix_proposed' matches: leave untouched.
  }
  if (toInsert.length) {
    await supabase.from("health_findings").insert(toInsert);
  }
  if (toReopen.length) {
    await supabase
      .from("health_findings")
      .update({ status: "open", proposed_fix: null })
      .in("id", toReopen);
  }

  // 2) Resolve stale: open findings whose condition no longer matches.
  const staleIds = existing
    .filter((row: any) => row.status === "open" && !detectedKeys.has(findingKey(row)))
    .map((row: any) => row.id);
  if (staleIds.length) {
    await supabase.from("health_findings").update({ status: "fixed" }).in("id", staleIds);
  }

  return { findings: detected.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime findings from the self-verify loop (closes the intelligence loop:
// verification failures surface in the Self-Heal tab instead of vanishing
// when the build stream ends).
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RUNTIME_FINDINGS = 10;

/** First line, trimmed and capped — runtime errors can be huge stack dumps. */
function runtimeTitle(error: string): string {
  const firstLine = error.split("\n")[0].trim();
  return `Runtime: ${firstLine.slice(0, 160) || "unknown error"}`;
}

/**
 * Persist unresolved self-verification errors as 'runtime' health findings.
 * Called after runSelfVerification when the result did NOT pass — the errors
 * that survived the auto-fix rounds are exactly the ones a human (or the
 * approval-gated AI fix flow) still needs to look at.
 *
 * Best-effort: never throws (verification callers treat everything here as
 * non-fatal). Dedupe matches runHealthScan's check-then-insert on
 * project_id+category+title+file_path with status != 'dismissed'.
 */
export async function recordVerificationFindings({
  supabase,
  projectId,
  userId,
  verification,
}: {
  supabase: any;
  projectId: string;
  userId: string;
  verification: { passed: boolean; engine: string; errors: string[] };
}): Promise<void> {
  try {
    if (verification.passed || verification.errors.length === 0) return;

    const candidates: DetectedFinding[] = [];
    const seen = new Set<string>();
    for (const error of verification.errors.slice(0, MAX_RUNTIME_FINDINGS)) {
      const finding: DetectedFinding = {
        category: "runtime",
        severity: "error",
        title: runtimeTitle(error),
        detail:
          `Self-verification (${verification.engine} engine) reported this error and the auto-fix rounds could not resolve it:\n\n${error.slice(0, 2000)}`,
        file_path: null,
      };
      const key = findingKey(finding);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(finding);
    }
    if (!candidates.length) return;

    const { data: existingRows } = await supabase
      .from("health_findings")
      .select("id, category, title, file_path, status")
      .eq("project_id", projectId)
      .eq("category", "runtime")
      .neq("status", "dismissed");
    const existingByKey = new Map<string, { id: string; status: string }>();
    for (const row of existingRows ?? []) {
      existingByKey.set(findingKey(row), { id: row.id, status: row.status });
    }

    const toInsert: any[] = [];
    const toReopen: string[] = [];
    for (const f of candidates) {
      const prior = existingByKey.get(findingKey(f));
      if (!prior) {
        toInsert.push({
          project_id: projectId,
          user_id: userId,
          category: f.category,
          severity: f.severity,
          title: f.title,
          detail: f.detail ?? null,
          file_path: null,
          status: "open",
        });
      } else if (prior.status === "fixed") {
        toReopen.push(prior.id);
      }
    }
    if (toInsert.length) await supabase.from("health_findings").insert(toInsert);
    if (toReopen.length) {
      await supabase
        .from("health_findings")
        .update({ status: "open", proposed_fix: null })
        .in("id", toReopen);
    }
  } catch {
    /* best-effort — never fail the calling build/verification flow */
  }
}
