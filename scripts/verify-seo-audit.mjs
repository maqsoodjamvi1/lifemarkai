/**
 * Behavioral regression suite for the static SEO analyzer (lib/seo/audit.ts).
 * Bundles the real TS via the local esbuild and asserts good/bad fixtures.
 *   node scripts/verify-seo-audit.mjs
 */
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "seo-"));
const out = join(tmp, "audit.mjs");

execSync(`${ROOT}/node_modules/.bin/esbuild ${ROOT}/lib/seo/audit.ts --bundle --format=esm --platform=node --outfile=${out}`, { stdio: "pipe" });
const { auditProject } = await import(out);

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) pass++; else { fail++; console.log("FAIL:", name); } };

const bad = auditProject([
  { path: "src/App.jsx", content: `export default function App(){ return <div><img src="/a.png"/><h1>Hi</h1><h1>Two</h1></div> }` },
  { path: "src/main.jsx", content: `import App from './App'` },
]);
check("bad: >=2 critical", bad.summary.critical >= 2);
check("bad: missing meta description", bad.findings.some(f => f.title === "Missing meta description"));
check("bad: missing title", bad.findings.some(f => f.title === "Missing page title"));
check("bad: img missing alt", bad.findings.some(f => f.title === "Images missing alt text"));
check("bad: multiple H1", bad.findings.some(f => f.title === "Multiple H1 headings"));
check("bad: no sitemap", bad.findings.some(f => f.title === "Missing sitemap.xml"));
check("bad: no robots", bad.findings.some(f => f.title === "No robots.txt"));
check("bad: low score", bad.score < 60);
check("bad: fixable carry autoFixPrompt", bad.findings.filter(f => f.fixable && f.severity !== "pass").every(f => typeof f.autoFixPrompt === "string"));

const good = auditProject([
  { path: "app/layout.tsx", content: `export const metadata = { title: "My App", description: "A great app for doing things well", alternates: { canonical: "https://x.com" }, openGraph: { images: ["/og.png"] } }; export default function L({children}){ return <html lang="en"><body>{children}</body></html> }` },
  { path: "app/robots.ts", content: `export default function robots(){ return { rules: [{ userAgent: '*' }] } }` },
  { path: "app/sitemap.ts", content: `export default function sitemap(){ return [] }` },
  { path: "app/page.tsx", content: `export default function P(){ return <main><h1>Welcome</h1><img src="/a.png" alt="a hero image"/><meta name="viewport" content="width=device-width, initial-scale=1"/></main> }` },
  { path: "public/llms.txt", content: `# My App` },
]);
check("good: 0 critical", good.summary.critical === 0);
check("good: title passes", good.findings.some(f => f.title === "Page title present"));
check("good: description passes", good.findings.some(f => f.title === "Meta description present"));
check("good: robots passes", good.findings.some(f => f.title === "robots.txt present"));
check("good: sitemap passes", good.findings.some(f => f.title === "Sitemap present"));
check("good: OG passes", good.findings.some(f => f.title === "Open Graph tags present"));
check("good: high score", good.score >= 85);
check("good: sorted failing-first", (() => { const o = { critical: 0, warning: 1, info: 2, pass: 3 }; for (let i = 1; i < good.findings.length; i++) if (o[good.findings[i-1].severity] > o[good.findings[i].severity]) return false; return true; })());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
