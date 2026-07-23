/**
 * Regression suite for the chat/agent intelligence heuristics (July 2026):
 *
 *   - isInformationalQuery   — Build-mode questions get ANSWERS, not rebuilds
 *   - isSmallSurgicalEdit    — micro-edits get surgical patches, not rebuilds
 *   - isReadOnlySql          — agent db_query tool write-guard
 *   - buildDesignSystemBlock — design tokens extracted for edit consistency
 *   - appendDecision / buildDecisionLogBlock — project decision memory
 *   - derivePreviewPages     — URL-bar "switch pages" dropdown derivation
 *
 * Run: npm run verify:intelligence   (or: npx tsx scripts/verify-intent-routing.ts)
 */

import { isInformationalQuery, isSmallSurgicalEdit } from "../lib/ai/build-intent";
import { isReadOnlySql } from "../lib/ai/agent-web-tools";
import {
  buildDesignSystemBlock,
  appendDecision,
  buildDecisionLogBlock,
  type BuildDecision,
} from "../lib/ai/design-system-context";
import { derivePreviewPages } from "../lib/preview/derive-pages";

let failures = 0;
let total = 0;

function check(name: string, actual: unknown, expected: unknown) {
  total++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`✗ ${name}\n    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function truthy(name: string, actual: unknown) {
  total++;
  if (!actual) {
    failures++;
    console.error(`✗ ${name} — expected truthy, got ${JSON.stringify(actual)}`);
  }
}

// ── isInformationalQuery ────────────────────────────────────────────────────
for (const p of [
  "why is the cart empty?",
  "Explain how authentication works in this app",
  "What pages does this site have",
  "Investigate this without any edits yet. Walk me through what you find before suggesting anything.",
  "does the contact form save to the database?",
  "review the checkout flow for bugs",
  "how does routing work here",
]) check(`informational: "${p}"`, isInformationalQuery(p), true);

for (const p of [
  "add a dark mode toggle",
  "why is the cart empty? fix it",
  "can you add a footer?",
  "make the hero bigger",
  "fix the runtime error",
  "change services to cargo",
  "build an ecommerce store",
  "update the pricing page copy",
  "",
]) check(`not informational: "${p}"`, isInformationalQuery(p), false);

// ── isSmallSurgicalEdit ─────────────────────────────────────────────────────
for (const p of [
  'change the title to "CargoPro"',
  "update the phone number to 555-1234",
  'fix typo: change "Frieght" to "Freight"',
  "change primary color to teal",
  'rename the CTA to "Start now"',
  'set the tagline to "Ship smarter"',
  "change the hero heading",
]) check(`surgical: "${p}"`, isSmallSurgicalEdit(p), true);

for (const p of [
  "change the layout of the pricing page",
  "add a contact section",
  "redesign the homepage",
  "change services to cargo",
  "update the header menu",
  "make the site responsive",
  "change the About page content and add a team section",
  "build an online store",
  "why is the cart empty?",
  "change the title " + "x".repeat(220),
]) check(`not surgical: "${p}"`, isSmallSurgicalEdit(p), false);

// ── isReadOnlySql ───────────────────────────────────────────────────────────
for (const q of [
  "SELECT * FROM users LIMIT 5",
  "select count(*) from orders;",
  "WITH t AS (SELECT 1) SELECT * FROM t",
  "EXPLAIN SELECT 1",
  "select * from t -- ; drop table x",
]) check(`read-only: "${q.slice(0, 40)}"`, isReadOnlySql(q), true);

for (const q of [
  "SELECT 1; DROP TABLE users",
  "DROP TABLE users",
  "INSERT INTO t VALUES (1)",
  "WITH t AS (DELETE FROM users RETURNING *) SELECT * FROM t",
  "UPDATE t SET a=1",
  "VACUUM",
  "",
]) check(`write blocked: "${q.slice(0, 40)}"`, isReadOnlySql(q), false);

// ── buildDesignSystemBlock ──────────────────────────────────────────────────
const dsFiles = [
  {
    path: "src/index.css",
    content: ':root { --primary: #2F6FED; --radius: 12px; }\n.dark { --primary: #5E89F2; }\nbody { font-family: "Inter", sans-serif; }',
  },
  { path: "index.html", content: '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap">' },
  { path: "src/components/ui/Button.tsx", content: "" },
  { path: "tailwind.config.ts", content: 'export default { theme: { extend: { colors: {\n  brand: "#2F6FED",\n} \n} } }' },
];
const dsBlock = buildDesignSystemBlock(dsFiles);
truthy("design block built", dsBlock);
truthy("css var extracted (light wins)", dsBlock?.includes("--primary: #2F6FED"));
truthy("dark duplicate skipped", !dsBlock?.includes("#5E89F2"));
truthy("font-family found", dsBlock?.includes("Inter"));
truthy("google font decoded", dsBlock?.includes("Space Grotesk"));
truthy("ui kit listed", dsBlock?.includes("Button"));
truthy("tailwind keys", dsBlock?.includes("brand"));
check("no design surface → null", buildDesignSystemBlock([{ path: "src/App.tsx", content: "x" }]), null);

// ── decision log ────────────────────────────────────────────────────────────
let log: BuildDecision[] = appendDecision(undefined, { at: "2026-07-21T00:00:00Z", req: "add dark mode", files: 3 });
for (let i = 0; i < 20; i++) log = appendDecision(log, { at: "2026-07-21T00:00:00Z", req: `change ${i}`, files: 1 });
check("decision log capped at 15", log.length, 15);
check("newest decision kept", log[14].req, "change 19");
truthy("decision block renders newest", buildDecisionLogBlock(log)?.includes("change 19"));
check("empty log → null", buildDecisionLogBlock([]), null);
check("junk log → null", buildDecisionLogBlock("junk"), null);

// ── derivePreviewPages ──────────────────────────────────────────────────────
const pages = derivePreviewPages([
  {
    path: "src/App.tsx",
    content:
      '<Routes><Route path="/" element={<Index/>}/><Route path="/about" element={<About/>}/><Route path="/blog/:id" element={<Post/>}/><Route path="*" element={<NotFound/>}/></Routes>',
  },
  { path: "src/pages/Index.tsx", content: "" },
  { path: "src/pages/ContactUs.tsx", content: "" },
  { path: "src/pages/NotFound.tsx", content: "" },
  { path: "src/app/(marketing)/pricing/page.tsx", content: "" },
]);
const paths = pages.map((p) => p.path);
check("homepage first", paths[0], "/");
truthy("route extracted", paths.includes("/about"));
truthy("CamelCase page → kebab", paths.includes("/contact-us"));
truthy("route group stripped", paths.includes("/pricing"));
truthy("no dynamic routes", !paths.some((p) => p.includes(":") || p === "*"));
truthy("404 skipped", !paths.includes("/not-found") && !paths.includes("/notfound"));
check("homepage label", pages[0].label, "Homepage");

// ── result ──────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n${failures}/${total} intelligence-routing checks FAILED`);
  process.exit(1);
}
console.log(`All ${total} intelligence-routing checks passed ✓`);
