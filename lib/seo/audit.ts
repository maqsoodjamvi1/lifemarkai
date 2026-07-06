/**
 * Static SEO analyzer (real replacement for the SEO panel's previously-simulated
 * audit). Pure and dependency-free — scans a project's files for the on-page SEO
 * signals that actually move the needle, and returns findings + a score.
 *
 * Findings intentionally mirror the shape the SEO panel renders (severity +
 * category + auto-fix prompt) so the UI can drop them in directly.
 */

export type SeoSeverity = "pass" | "info" | "warning" | "critical";
export type SeoCategory =
  | "page_basics" | "indexing" | "metadata" | "open_graph" | "structured_data"
  | "content" | "ai_readiness" | "performance" | "accessibility" | "mobile";

export interface SeoFinding {
  title: string;
  severity: SeoSeverity;
  category: SeoCategory;
  description: string;
  recommendation: string;
  fixable: boolean;
  autoFixPrompt?: string;
}

export interface SeoAuditResult {
  score: number; // 0–100
  findings: SeoFinding[];
  summary: Record<SeoSeverity, number> & { total: number };
}

interface AuditFile { path: string; content: string }

const CODE_RE = /\.(html?|tsx?|jsx?|mjs|cjs|vue|svelte|astro)$/i;

// Build one lowercased haystack of markup/meta-bearing files (bounded per file),
// plus the set of file paths (for robots/sitemap/llms detection by filename).
function buildHaystack(files: AuditFile[]): { hay: string; rawHay: string; paths: string[] } {
  const parts: string[] = [];
  const rawParts: string[] = [];
  for (const f of files) {
    if (!CODE_RE.test(f.path)) continue;
    const c = (f.content ?? "").slice(0, 200_000);
    rawParts.push(c);
    parts.push(c.toLowerCase());
  }
  return { hay: parts.join("\n"), rawHay: rawParts.join("\n"), paths: files.map((f) => f.path.toLowerCase()) };
}

const anyPath = (paths: string[], re: RegExp) => paths.some((p) => re.test(p));

export function auditProject(files: AuditFile[]): SeoAuditResult {
  const { hay, rawHay, paths } = buildHaystack(files);
  const findings: SeoFinding[] = [];
  const add = (f: SeoFinding) => findings.push(f);

  const has = (re: RegExp) => re.test(hay);

  // ── Page title ──────────────────────────────────────────────────────────────
  const hasTitle = has(/<title[\s>]/) || has(/\btitle\s*:\s*["'`]/) || has(/document\.title\s*=/) || has(/\bmetadata\b[\s\S]{0,200}?title/);
  add(hasTitle
    ? { title: "Page title present", severity: "pass", category: "page_basics", description: "A page/document title was found.", recommendation: "No action needed.", fixable: false }
    : { title: "Missing page title", severity: "critical", category: "page_basics", description: "No <title> (or framework metadata title) found. The title is the single most important on-page SEO element.", recommendation: "Add a descriptive title of 50–60 characters to each page.", fixable: true, autoFixPrompt: "Add a descriptive <title> tag (or Next.js metadata.title) to each page. Keep it under 60 characters and include the primary keyword." });

  // ── Meta description ─────────────────────────────────────────────────────────
  const hasDesc = has(/<meta[^>]+name=["']description["']/) || has(/\bdescription\s*:\s*["'`]/);
  add(hasDesc
    ? { title: "Meta description present", severity: "pass", category: "metadata", description: "A meta description was found.", recommendation: "No action needed.", fixable: false }
    : { title: "Missing meta description", severity: "critical", category: "metadata", description: "No meta description found. It's shown in search results and strongly influences click-through rate.", recommendation: "Add a unique meta description of 150–160 characters per page.", fixable: true, autoFixPrompt: "Add a unique meta description (or Next.js metadata.description) of under 160 characters to every page." });

  // ── Canonical ────────────────────────────────────────────────────────────────
  const hasCanonical = has(/rel=["']canonical["']/) || has(/canonical\s*:/);
  add(hasCanonical
    ? { title: "Canonical URL set", severity: "pass", category: "indexing", description: "A canonical link/metadata was found.", recommendation: "No action needed.", fixable: false }
    : { title: "No canonical URL", severity: "warning", category: "indexing", description: "Missing canonical link. Search engines may index duplicate content.", recommendation: "Add a canonical URL to each page.", fixable: true, autoFixPrompt: "Add a canonical link element (or Next.js metadata.alternates.canonical) to each page pointing to its preferred URL." });

  // ── Open Graph ───────────────────────────────────────────────────────────────
  const hasOG = has(/property=["']og:/) || has(/\bopengraph\b/) || has(/\bog:image\b/);
  add(hasOG
    ? { title: "Open Graph tags present", severity: "pass", category: "open_graph", description: "Open Graph metadata was found.", recommendation: "No action needed.", fixable: false }
    : { title: "Open Graph tags missing", severity: "warning", category: "open_graph", description: "No Open Graph tags. These control how the page appears when shared on social media.", recommendation: "Add og:title, og:description, og:image and og:url.", fixable: true, autoFixPrompt: "Add Open Graph meta tags (og:title, og:description, og:image, og:url) — or Next.js metadata.openGraph — to each page." });

  // ── robots.txt ───────────────────────────────────────────────────────────────
  const hasRobots = anyPath(paths, /(^|\/)robots\.(txt|ts|js)$/) || anyPath(paths, /(^|\/)app\/robots\.(ts|js)$/);
  add(hasRobots
    ? { title: "robots.txt present", severity: "pass", category: "indexing", description: "A robots file was found.", recommendation: "No action needed.", fixable: false }
    : { title: "No robots.txt", severity: "warning", category: "indexing", description: "No robots.txt detected. Crawlers have no guidance.", recommendation: "Add a robots.txt (or app/robots.ts) at the site root.", fixable: true, autoFixPrompt: "Create a robots.txt (or Next.js app/robots.ts) with sensible crawl rules and a link to the sitemap." });

  // ── sitemap.xml ──────────────────────────────────────────────────────────────
  const hasSitemap = anyPath(paths, /(^|\/)sitemap.*\.(xml|ts|js)$/) || anyPath(paths, /(^|\/)app\/sitemap\.(ts|js)$/);
  add(hasSitemap
    ? { title: "Sitemap present", severity: "pass", category: "indexing", description: "A sitemap was found.", recommendation: "No action needed.", fixable: false }
    : { title: "Missing sitemap.xml", severity: "warning", category: "indexing", description: "No XML sitemap. A sitemap helps search engines discover all pages.", recommendation: "Generate a sitemap and submit it to Search Console.", fixable: true, autoFixPrompt: "Create a sitemap (sitemap.xml or Next.js app/sitemap.ts) listing all public routes." });

  // ── Image alt text ───────────────────────────────────────────────────────────
  const imgTags = rawHay.match(/<img\b[^>]*>/gi) ?? [];
  const imgsMissingAlt = imgTags.filter((t) => !/\balt\s*=/.test(t)).length;
  if (imgTags.length === 0) {
    // nothing to assert
  } else if (imgsMissingAlt > 0) {
    add({ title: "Images missing alt text", severity: "warning", category: "accessibility", description: `${imgsMissingAlt} of ${imgTags.length} <img> element(s) lack an alt attribute — hurts accessibility and image search.`, recommendation: "Add descriptive alt text to every <img>.", fixable: true, autoFixPrompt: "Add descriptive alt attributes to all <img> elements. Decorative images should use alt=\"\"." });
  } else {
    add({ title: "Images have alt text", severity: "pass", category: "accessibility", description: "All detected images have alt attributes.", recommendation: "No action needed.", fixable: false });
  }

  // ── Structured data ──────────────────────────────────────────────────────────
  add(has(/application\/ld\+json/) || has(/schema\.org/)
    ? { title: "Structured data present", severity: "pass", category: "structured_data", description: "JSON-LD / schema.org markup was found.", recommendation: "No action needed.", fixable: false }
    : { title: "No structured data (JSON-LD)", severity: "info", category: "structured_data", description: "No JSON-LD found. Structured data enables rich snippets in Google.", recommendation: "Add schema.org markup (WebApplication, Organization, etc.).", fixable: true, autoFixPrompt: "Add JSON-LD structured data (schema.org) — WebApplication and Organization schemas appropriate for the site." });

  // ── Heading hierarchy (coarse) ───────────────────────────────────────────────
  const h1Count = (rawHay.match(/<h1\b/gi) ?? []).length;
  if (h1Count > 1) {
    add({ title: "Multiple H1 headings", severity: "info", category: "content", description: `Found ${h1Count} H1 tags. Each page should have exactly one H1.`, recommendation: "Use a single H1 per page; demote the rest to H2/H3.", fixable: true, autoFixPrompt: "Ensure each page has exactly one <h1>; convert extra H1s to the appropriate lower heading level and keep hierarchy logical." });
  }

  // ── Viewport / mobile ────────────────────────────────────────────────────────
  add(has(/name=["']viewport["']/) || has(/viewport\s*:/)
    ? { title: "Viewport meta present", severity: "pass", category: "mobile", description: "A responsive viewport meta tag was found.", recommendation: "No action needed.", fixable: false }
    : { title: "Missing viewport meta tag", severity: "warning", category: "mobile", description: "No viewport meta tag. The site may not render correctly on mobile.", recommendation: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.", fixable: true, autoFixPrompt: "Add a responsive viewport meta tag (width=device-width, initial-scale=1) to the document head." });

  // ── HTML lang ────────────────────────────────────────────────────────────────
  if (!has(/<html[^>]+lang=/)) {
    add({ title: "Missing html lang attribute", severity: "info", category: "accessibility", description: "The root <html> element has no lang attribute — hurts accessibility and localisation signals.", recommendation: "Add lang=\"en\" (or the correct locale) to <html>.", fixable: true, autoFixPrompt: "Add a lang attribute to the root <html> element matching the site's primary language." });
  }

  // ── llms.txt (AI discoverability) ────────────────────────────────────────────
  if (!anyPath(paths, /(^|\/)llms\.txt$/)) {
    add({ title: "Consider adding llms.txt", severity: "info", category: "ai_readiness", description: "An llms.txt file helps AI models understand your site's purpose and structure.", recommendation: "Add an llms.txt at the root describing your site for AI crawlers.", fixable: true, autoFixPrompt: "Create a public/llms.txt describing the site's purpose, key pages, and content for AI language models per the llms.txt standard." });
  }

  // ── Score + summary ──────────────────────────────────────────────────────────
  const summary = { pass: 0, info: 0, warning: 0, critical: 0, total: findings.length } as SeoAuditResult["summary"];
  for (const f of findings) summary[f.severity]++;
  const score = Math.max(0, Math.min(100, 100 - summary.critical * 20 - summary.warning * 8 - summary.info * 3));

  // Failing first, then passing.
  const order: Record<SeoSeverity, number> = { critical: 0, warning: 1, info: 2, pass: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return { score, findings, summary };
}
