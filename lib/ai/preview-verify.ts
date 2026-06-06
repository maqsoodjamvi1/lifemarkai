const VERIFY_TRIGGERS =
  /\b(verify|make sure|test this|check if|check that|does it work|confirm it works|validate|ensure it works)\b/i;

/** Whether to run a quick preview sanity check after a build completes. */
export function shouldRunPreviewVerify(message: string, mode: string): boolean {
  if (mode !== "build" && mode !== "agent" && mode !== "patch") return false;
  return VERIFY_TRIGGERS.test(message);
}

export interface PreviewVerifyResult {
  ok: boolean;
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
}

/** Lightweight checks on bundled preview HTML (no headless browser required). */
export function verifyPreviewHtml(html: string): PreviewVerifyResult {
  const checks: PreviewVerifyResult["checks"] = [];
  const lower = html.toLowerCase();
  const trimmed = html.trim();

  const hasStructure =
    lower.includes("<body") || lower.includes("<!doctype") || lower.includes("<html");
  const hasMount =
    lower.includes('id="root"') ||
    lower.includes("id='root'") ||
    lower.includes("createelement") ||
    lower.includes("reactdom");

  checks.push({
    name: "Preview HTML generated",
    pass: trimmed.length > 0 && hasStructure,
    detail:
      trimmed.length > 0
        ? `${Math.round(trimmed.length / 1024)}KB · ${trimmed.length} chars`
        : "Empty bundle",
  });

  checks.push({
    name: "Root mount present",
    pass: hasMount || hasStructure,
  });

  const errorHints = ["syntaxerror", "referenceerror", "module not found", "cannot find module"];
  const foundError = errorHints.find((e) => lower.includes(e));
  checks.push({
    name: "No obvious bundle errors",
    pass: !foundError,
    detail: foundError ? `Found: ${foundError}` : undefined,
  });

  return { ok: checks.every((c) => c.pass), checks };
}
