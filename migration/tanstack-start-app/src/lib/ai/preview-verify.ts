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

/**
 * Static checks on the bundled preview HTML — no headless browser required.
 *
 * These catch the exact "blank screen" fatals we've hit in production, purely
 * from the generated HTML string, so verification is robust even when a test
 * suite (and Playwright) isn't available:
 *   - unguarded `tailwind.config` → "tailwind is not defined" blanks the preview
 *   - surviving `import.meta.env` → "Cannot use import.meta outside a module"
 *   - leftover ES `import … from` → SyntaxError in eval
 *   - `const` module handles → duplicate-declaration crash
 *   - missing #root / render bootstrap → nothing mounts
 *
 * Any failed check is a fixable, surfaced problem instead of a silent white page.
 */
export function verifyPreviewHtml(html: string): PreviewVerifyResult {
  const checks: PreviewVerifyResult["checks"] = [];
  const trimmed = html.trim();
  const lower = html.toLowerCase();

  const hasStructure = lower.includes("<body") || lower.includes("<!doctype") || lower.includes("<html");
  checks.push({
    name: "Preview HTML generated",
    pass: trimmed.length > 0 && hasStructure,
    detail: trimmed.length > 0 ? `${Math.round(trimmed.length / 1024)}KB` : "Empty bundle",
  });

  const hasMount = /id=["']root["']/.test(html);
  checks.push({
    name: "Root mount present",
    pass: hasMount,
    detail: hasMount ? undefined : 'no <div id="root"> — nothing to mount into',
  });

  const hasRender = /ReactDOM|createRoot|__Mrequire\(/.test(html);
  checks.push({
    name: "Render bootstrap present",
    pass: hasRender,
    detail: hasRender ? undefined : "no ReactDOM/createRoot/__Mrequire — app never renders",
  });

  // ── Known blank-screen fatals (static, deterministic) ──────────────────────
  const unguardedTailwind = /<script>\s*tailwind\.config\s*=/.test(html);
  checks.push({
    name: "Tailwind config guarded",
    pass: !unguardedTailwind,
    detail: unguardedTailwind ? "unguarded `tailwind.config` → 'tailwind is not defined' blanks the preview" : undefined,
  });

  const rawImportMeta = /import\.meta\.env\./.test(html);
  checks.push({
    name: "import.meta rewritten",
    pass: !rawImportMeta,
    detail: rawImportMeta ? "`import.meta.env.` survived → 'Cannot use import.meta outside a module'" : undefined,
  });

  const leftoverImport = /^\s*import\s+[\w{}*,\s]+\s+from\s+["']/m.test(html);
  checks.push({
    name: "No leftover ES imports",
    pass: !leftoverImport,
    detail: leftoverImport ? "leftover `import … from` statement → SyntaxError in eval" : undefined,
  });

  const constHandle = /const\s+__mod_\w+\s*=\s*window\.__Mrequire/.test(html);
  checks.push({
    name: "Module handles use var",
    pass: !constHandle,
    detail: constHandle ? "`const` module handle → 'already declared' duplicate crash" : undefined,
  });

  return { ok: checks.every((c) => c.pass), checks };
}
