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

  const isStaticPreview = /data-lifemark-static-bridge|data-lifemark-module-registry|data-lifemark-file=/.test(html);
  const hasMount = isStaticPreview || /id=["'](?:root|__next)["']/.test(html);
  checks.push({
    name: "Root mount present",
    pass: hasMount,
    detail: hasMount ? undefined : 'no framework mount or static document body was found',
  });

  const hasRender = isStaticPreview || /ReactDOM|createRoot|__Mrequire\(/.test(html);
  checks.push({
    name: "Render bootstrap present",
    pass: hasRender,
    detail: hasRender ? undefined : "no framework or static-project render bootstrap — app never renders",
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

  // ── CSS coverage: classes the markup relies on but no rule ever styles ────
  // Doesn't catch a crash — catches the "renders, but looks like raw HTML"
  // failure mode: a generated stylesheet that never mentions the very classes
  // the markup uses (e.g. .sidebar/.nav-list defined but .nav-link never
  // styled, .app-shell missing its flex layout). Real-browser verification
  // would have caught this visually; the static fallback needs an explicit
  // check for it. Skipped for Tailwind CDN projects — their utility classes
  // are compiled at runtime, not present as literal selectors in the source.
  const isTailwindCdn = /type=["']text\/tailwindcss["']/.test(html);
  if (!isTailwindCdn) {
    const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
    const cssText = styleBlocks.join("\n");
    if (cssText.trim().length > 0) {
      const classCounts = new Map<string, number>();
      for (const m of html.matchAll(/\sclass(?:Name)?=["']([^"']+)["']/g)) {
        for (const cls of m[1].split(/\s+/)) {
          if (!cls) continue;
          classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
        }
      }
      const uncovered = [...classCounts.entries()]
        .filter(([cls, count]) => count >= 2 && !cssText.includes(`.${cls}`))
        .map(([cls]) => cls);
      checks.push({
        name: "CSS covers markup classes",
        pass: uncovered.length === 0,
        detail:
          uncovered.length > 0
            ? `${uncovered.length} class${uncovered.length === 1 ? "" : "es"} used repeatedly in the markup but never styled: ${uncovered.slice(0, 6).join(", ")}${uncovered.length > 6 ? "…" : ""}`
            : undefined,
      });
    }
  }

  return { ok: checks.every((c) => c.pass), checks };
}
