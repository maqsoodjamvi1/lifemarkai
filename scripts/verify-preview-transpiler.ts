/**
 * Preview transpiler regression suite.
 *
 * The fallback preview engine (lib/preview/build-fallback-html.ts) has been the
 * source of repeated "preview won't compile" bugs. This suite reproduces each
 * fixed bug class with a small fixture app, renders the preview HTML
 * server-side (pure string assembly — no browser needed), and asserts the bad
 * pattern is gone. Run before flipping the esbuild engine on, and in CI.
 *
 *   npx tsx scripts/verify-preview-transpiler.ts
 *
 * NOTE: starter templates are design specs (sections/tokens), not code, so the
 * correct unit for transpiler reliability is fixtures like these, not templates.
 */
import { buildFallbackHtml } from "../lib/preview/build-fallback-html";
import { verifyPreviewHtml } from "../lib/ai/preview-verify";
import type { ProjectFile } from "../types/database";

type Fixture = { name: string; files: ProjectFile[]; assert: (html: string) => string[] };

const f = (path: string, content: string): ProjectFile =>
  ({ path, content, language: path.endsWith(".css") ? "css" : "typescriptreact" } as ProjectFile);

const fixtures: Fixture[] = [
  {
    name: "duplicate imports from same module (→ var handles, no duplicate const)",
    files: [
      f("src/lib/utils.ts", `export const cn = (...a: string[]) => a.filter(Boolean).join(" ");
export const formatDate = (d: number) => new Date(d).toISOString();`),
      f("src/components/TaskCard.tsx", `import { cn } from "../lib/utils";
import { formatDate } from "../lib/utils";
export default function TaskCard() { return <div className={cn("a","b")}>{formatDate(1)}</div>; }`),
      f("src/App.tsx", `import TaskCard from "./components/TaskCard";
export default function App(){ return <TaskCard/>; }`),
      f("src/main.tsx", `import App from "./App"; export default App;`),
    ],
    assert: (html) => {
      const errs: string[] = [];
      // The fix turned module handles into `var` (legal to redeclare). A `const`
      // handle means the old transpiler is back and duplicate imports will throw.
      if (/const\s+__mod_\w+\s*=\s*window\.__Mrequire/.test(html)) {
        errs.push("module handle declared with const (should be var) — duplicate-declaration regression");
      }
      if (!/var\s+__mod_\w+\s*=\s*window\.__Mrequire/.test(html)) {
        errs.push("expected at least one `var __mod_… = window.__Mrequire` handle");
      }
      return errs;
    },
  },
  {
    name: "import.meta.env rewritten (supabase-style scaffold)",
    files: [
      f("src/lib/supabase.ts", `const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const config = { url, key };`),
      f("src/App.tsx", `import { config } from "./lib/supabase";
export default function App(){ return <pre>{JSON.stringify(config)}</pre>; }`),
      f("src/main.tsx", `import App from "./App"; export default App;`),
      f(".env.local", `VITE_SUPABASE_URL=https://demo.supabase.co\nVITE_SUPABASE_ANON_KEY=anon123`),
    ],
    assert: (html) => {
      const errs: string[] = [];
      // Raw import.meta is a SyntaxError in non-module eval — it must be rewritten.
      if (/import\.meta\.env\./.test(html)) {
        errs.push("`import.meta.env.` survived into output — will throw 'Cannot use import.meta outside a module'");
      }
      if (!/__VITE_ENV/.test(html)) {
        errs.push("expected the injected window.__VITE_ENV shim");
      }
      return errs;
    },
  },
  {
    name: "relative multi-file resolution + no leftover ES import statements",
    files: [
      f("src/data/items.ts", `export const items = [{ id: 1, label: "One" }];`),
      f("src/components/List.tsx", `import { items } from "../data/items";
export function List(){ return <ul>{items.map(i=> <li key={i.id}>{i.label}</li>)}</ul>; }`),
      f("src/App.tsx", `import { List } from "./components/List";
export default function App(){ return <List/>; }`),
      f("src/main.tsx", `import App from "./App"; export default App;`),
    ],
    assert: (html) => {
      const errs: string[] = [];
      // A leftover top-level `import ... from "..."` inside an eval'd module is a
      // guaranteed SyntaxError — the transpiler must rewrite them all to __Mrequire.
      if (/^\s*import\s+[\w{}*,\s]+\s+from\s+["']/m.test(html)) {
        errs.push("leftover ES `import … from` statement in output (must become __Mrequire)");
      }
      if (!/__Mrequire\(['"]src\/data\/items['"]\)|__Mrequire\(['"]\.\.\/data\/items['"]\)/.test(html)) {
        errs.push("relative import to src/data/items was not resolved to an __Mrequire call");
      }
      return errs;
    },
  },
];

let passed = 0;
let failed = 0;

for (const fx of fixtures) {
  let html = "";
  const errs: string[] = [];
  try {
    html = buildFallbackHtml(fx.files);
  } catch (e) {
    errs.push(`buildFallbackHtml threw: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (html) {
    errs.push(...fx.assert(html));
    const v = verifyPreviewHtml(html);
    if (!v.ok) {
      errs.push(`verifyPreviewHtml failed: ${v.checks.filter((c) => !c.pass).map((c) => c.name).join(", ")}`);
    }
  }
  if (errs.length === 0) {
    passed++;
    console.log(`PASS  ${fx.name}`);
  } else {
    failed++;
    console.log(`FAIL  ${fx.name}`);
    for (const e of errs) console.log(`        - ${e}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
