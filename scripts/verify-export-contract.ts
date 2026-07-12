/**
 * Regression suite for the module-contract checker (lib/preview/export-contract.ts).
 *
 * Fixtures are taken from a REAL broken generation observed in production
 * (project df9dd882, "E-commerce store"), where the model emitted an app that
 * imported 4 files it never created and 2 exports that didn't exist. The preview
 * froze with a single opaque `Cannot read properties of undefined (reading 'map')`
 * and the auto-fixer could not act on it.
 *
 * Run: npx tsx scripts/verify-export-contract.ts
 */
import {
  findMissingExports,
  findMissingModules,
  findContractErrors,
  type ProjectFileLike,
} from "../lib/preview/export-contract";

const f = (path: string, content: string): ProjectFileLike => ({ path, content });

const files: ProjectFileLike[] = [
  f("src/data/mock.ts", `
export const MOCK_SERVICES = [];
export const MOCK_TEAM = [];
export const MOCK_STATS = [];
export const MOCK_TESTIMONIALS = [];
export const MOCK_BLOG_POSTS = [];
export const MOCK_PORTFOLIO = [];
export const MOCK_NAV_LINKS = [];
`),
  f("src/lib/utils.ts", `
export const cn = (...a: string[]) => a.join(" ");
export function formatDate(d: string) { return d; }
`),

  // (1) missing EXPORT from a module that exists — the crash we actually saw
  f("src/components/home/PartnersSection.tsx", `
import { MOCK_PARTNERS } from '../../data/mock';
export default function PartnersSection() {
  return <div>{MOCK_PARTNERS.map((p) => p.name)}</div>;
}
`),
  // (2) another missing export, masked by the first crash
  f("src/components/home/FeaturedJournal.tsx", `
import { formatDateShort } from '@/lib/utils';
import { MOCK_BLOG_POSTS } from '@/data/mock';
export default function FeaturedJournal() { return <div>{formatDateShort("x")}</div>; }
`),
  // (3) missing FILE, imported for its types
  f("src/components/home/StatsSection.tsx", `
import { Stat, Service } from '../../lib/types';
import { MOCK_STATS } from '@/data/mock';
export default function StatsSection() { return <div>{MOCK_STATS.length}</div>; }
`),
  // (4) missing FILES — named import + DEFAULT imports (pages)
  f("src/App.tsx", `
import { Navbar } from './components/layout/Navbar';
import Portfolio from './pages/Portfolio';
import BlogPost from './pages/BlogPost';
import './index.css';
import { cn } from '@/lib/utils';
export default function App() { return <Navbar />; }
`),
  f("src/index.css", `body { margin: 0; }`),

  // ── false-positive traps — none of these may be reported ──────────────────
  f("src/components/Bare.tsx", `
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
export default function Bare() { return <Check />; }
`),
  f("src/lib/all.ts", `export * from './other';`),
  f("src/lib/other.ts", `export const X = 1;`),
  f("src/components/Star.tsx", `
import { ANYTHING } from '../lib/all';
export default function Star() { return <div>{ANYTHING}</div>; }
`),
  f("src/components/Idx.tsx", `
import { Thing } from './widgets';
export default function Idx() { return <div>{Thing}</div>; }
`),
  f("src/components/widgets/index.ts", `export const Thing = 1;`),
];

let failed = 0;
const check = (cond: boolean, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"} — ${label}`);
  if (!cond) failed++;
};

const mods = findMissingModules(files);
const exps = findMissingExports(files);

console.log("\nMissing FILES:");
for (const m of mods) console.log(`  ${m.importer} -> "${m.spec}" (expected ${m.expected}) needs: [${m.imported.join(", ")}]`);
console.log("Missing EXPORTS:");
for (const e of exps) console.log(`  ${e.name} <- ${e.module} (imported by ${e.importer})`);
console.log("");

const expected = (p: string) => mods.some((m) => m.expected === p);

// true positives
check(expected("src/lib/types"), "detects missing file src/lib/types");
check(
  mods.find((m) => m.expected === "src/lib/types")?.imported.join(",") === "Stat,Service",
  "…and names the symbols that file must export"
);
check(expected("src/components/layout/Navbar"), "detects missing file Navbar (named import)");
check(
  expected("src/pages/Portfolio") && expected("src/pages/BlogPost"),
  "detects missing pages imported as DEFAULT imports"
);
check(exps.some((e) => e.name === "MOCK_PARTNERS"), "detects missing export MOCK_PARTNERS (the production crash)");
check(exps.some((e) => e.name === "formatDateShort"), "detects missing export formatDateShort (masked by the first crash)");

// false positives
check(!mods.some((m) => /index\.css/.test(m.expected)), "existing css import not flagged");
check(!mods.some((m) => ["react", "framer-motion", "lucide-react"].includes(m.spec)), "bare package imports not flagged");
check(
  !exps.some((e) => ["useState", "motion", "Check", "cn", "MOCK_STATS", "MOCK_BLOG_POSTS"].includes(e.name)),
  "valid named imports not flagged"
);
check(!exps.some((e) => e.name === "ANYTHING"), "module with `export *` stays silent (cannot enumerate)");
check(
  !mods.some((m) => /widgets/.test(m.expected)) && !exps.some((e) => e.name === "Thing"),
  "directory/index.ts resolution works"
);
check(
  !exps.some((e) => ["Stat", "Service"].includes(e.name)),
  "symbols of a MISSING FILE are not double-reported as missing exports"
);

// ordering: missing files must come first (they explain the most)
const all = findContractErrors(files);
check(
  all.length === mods.length + exps.length && /no such file exists/.test(all[0]),
  "findContractErrors reports missing FILES before missing EXPORTS"
);

check(mods.length === 4, `exactly 4 missing files (got ${mods.length})`);
check(exps.length === 2, `exactly 2 missing exports (got ${exps.length})`);

console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
