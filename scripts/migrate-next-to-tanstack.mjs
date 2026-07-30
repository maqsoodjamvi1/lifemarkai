#!/usr/bin/env node
/**
 * Next.js → TanStack Start codemod (mechanical rewrites).
 *
 * Handles the high-volume, low-risk import/API swaps so the human/AI only has
 * to hand-convert the genuinely structural parts (route files, loaders, auth).
 * Report mode by default — NOTHING is written unless you pass --write.
 *
 *   node scripts/migrate-next-to-tanstack.mjs            # dry-run report
 *   node scripts/migrate-next-to-tanstack.mjs --write    # apply in place
 *   node scripts/migrate-next-to-tanstack.mjs --write src/routes/foo.tsx  # one file
 *
 * What it does NOT do (flagged for manual work): app/api route handlers,
 * middleware, RSC async pages, next/headers cookies() — see the migration guide.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WRITE = process.argv.includes("--write");
const EXPLICIT = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SCAN_DIRS = ["app", "components", "lib", "hooks"];
const SKIP = /node_modules|\.next|\.git|migration\/|scripts\//;

// Mechanical, safe substitutions (regex → replacement). Order matters.
const RULES = [
  { name: "next/link import", re: /import\s+Link\s+from\s+["']next\/link["'];?/g, to: 'import { Link } from "@tanstack/react-router";' },
  { name: "<Link href> → <Link to>", re: /<Link(\s[^>]*?)\shref=/g, to: "<Link$1 to=" },
  { name: "next/navigation useRouter", re: /useRouter(\(\))/g, to: "useNavigate$1" },
  { name: "next/navigation import", re: /from\s+["']next\/navigation["']/g, to: 'from "@tanstack/react-router"' },
  { name: "usePathname → useLocation().pathname", re: /const\s+(\w+)\s*=\s*usePathname\(\)/g, to: "const $1 = useLocation().pathname" },
  { name: "useSearchParams → useSearch", re: /useSearchParams(\(\))/g, to: "useSearch$1" },
  { name: "NextResponse.json", re: /NextResponse\.json\(/g, to: "json(" },
  { name: "NextRequest type", re: /\bNextRequest\b/g, to: "Request" },
  { name: "next/image import", re: /import\s+Image\s+from\s+["']next\/image["'];?/g, to: "// TODO(migrate): next/image removed — use a plain <img> or an image lib" },
  { name: "process.env.NEXT_PUBLIC_", re: /process\.env\.NEXT_PUBLIC_/g, to: "import.meta.env.VITE_" },
];

// Patterns that REQUIRE manual conversion — reported, never auto-rewritten.
const MANUAL = [
  { name: "API route handler (export GET/POST)", re: /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/ },
  { name: "next/headers cookies()/headers()", re: /from\s+["']next\/headers["']/ },
  { name: "@/lib/supabase/server (SSR auth)", re: /@\/lib\/supabase\/server/ },
  { name: "generateMetadata / metadata export", re: /export\s+(const\s+metadata|async\s+function\s+generateMetadata)/ },
  { name: "async RSC page component", re: /export\s+default\s+async\s+function\s+\w*Page/ },
];

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (SKIP.test(full)) continue;
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const files = EXPLICIT.length
  ? EXPLICIT.map((f) => path.resolve(ROOT, f))
  : SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

const ruleHits = Object.fromEntries(RULES.map((r) => [r.name, 0]));
const manualHits = Object.fromEntries(MANUAL.map((m) => [m.name, 0]));
let filesChanged = 0;
const manualFiles = new Set();

for (const file of files) {
  let src;
  try { src = fs.readFileSync(file, "utf8"); } catch { continue; }
  let out = src;
  for (const r of RULES) {
    const before = out;
    out = out.replace(r.re, r.to);
    if (out !== before) ruleHits[r.name] += (before.match(r.re) || []).length;
  }
  for (const m of MANUAL) {
    if (m.re.test(src)) { manualHits[m.name] += 1; manualFiles.add(path.relative(ROOT, file)); }
  }
  if (out !== src) {
    filesChanged++;
    if (WRITE) fs.writeFileSync(file, out);
  }
}

const line = (k, v) => `  ${String(v).padStart(5)}  ${k}`;
console.log(`\n=== Next.js → TanStack Start codemod (${WRITE ? "WRITE" : "DRY-RUN"}) ===`);
console.log(`Scanned ${files.length} files. ${filesChanged} file(s) ${WRITE ? "rewritten" : "would change"}.\n`);
console.log("Mechanical rewrites (auto):");
for (const [k, v] of Object.entries(ruleHits)) if (v) console.log(line(k, v));
console.log("\nNEEDS MANUAL migration (not auto-rewritten — see docs/tanstack-start-migration.md):");
for (const [k, v] of Object.entries(manualHits)) if (v) console.log(line(k, v));
console.log(`\n  ${manualFiles.size} distinct files contain manual-migration surface.`);
if (!WRITE) console.log("\nDry run — pass --write to apply the mechanical rewrites in place.");
