import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  formatSearchResult,
  runStructuralRewrite,
  runStructuralSearch,
} from "./structural-tools.ts";

const FILES = [
  {
    path: "src/api.ts",
    content: `export async function load(url: string) {
  const res = await fetch(url);
  return res.json();
}
// a comment mentioning console.log should not match
const label = "console.log(fake)";
console.log("boot");
`,
  },
  {
    path: "src/App.tsx",
    content: `export default function App() {
  console.log("render", Date.now());
  return <img src="/hero.png" />;
}
`,
  },
  { path: "notes.md", content: "console.log(not code)" },
];

test("structural search matches AST, not strings or comments", async () => {
  const res = await runStructuralSearch(FILES, "console.log($$$A)");
  assert.equal(res.available, true, "napi binary should load on dev machines");
  const paths = res.matches.map((m) => `${m.path}:${m.line}`).sort();
  // Exactly two real calls — the comment and the string literal do NOT match.
  assert.deepEqual(paths, ["src/App.tsx:2", "src/api.ts:7"]);
});

test("structural search formats for the agent", async () => {
  const res = await runStructuralSearch(FILES, "console.log($$$A)");
  const text = formatSearchResult(res, "console.log($$$A)");
  assert.match(text, /2 match\(es\)/);
  assert.match(text, /src\/api\.ts:7/);
});

test("no-match search says so", async () => {
  const res = await runStructuralSearch(FILES, "alert($MSG)");
  assert.equal(res.matches.length, 0);
  assert.match(formatSearchResult(res, "alert($MSG)"), /No structural matches/);
});

test("structural rewrite interpolates metavariables and rewrites all sites", async () => {
  const res = await runStructuralRewrite(
    FILES,
    "console.log($$$A)",
    "logger.debug($$$A)",
  );
  assert.equal(res.available, true);
  assert.equal(res.totalMatches, 2);
  assert.equal(res.changes.length, 2);

  const api = res.changes.find((c) => c.path === "src/api.ts")!;
  assert.match(api.newContent, /logger\.debug\("boot"\)/);
  // untouched: string literal + comment
  assert.match(api.newContent, /"console\.log\(fake\)"/);
  assert.match(api.newContent, /comment mentioning console\.log/);

  const app = res.changes.find((c) => c.path === "src/App.tsx")!;
  assert.match(app.newContent, /logger\.debug\("render", Date\.now\(\)\)/);
});

test("JSX structural rewrite (lazy-load every img)", async () => {
  // NB: ast-grep JSX quirk — a metavar can't sit in a plain string attribute
  // value position (src=$SRC matches nothing); $$$ATTRS captures the whole
  // attribute list and interpolates it back, which is the useful form anyway.
  const res = await runStructuralRewrite(
    FILES,
    "<img $$$ATTRS />",
    '<img $$$ATTRS loading="lazy" />',
  );
  const app = res.changes.find((c) => c.path === "src/App.tsx");
  assert.ok(app, "App.tsx should be rewritten");
  assert.match(app!.newContent, /loading="lazy"/);
});

test("rewrite touching nothing returns no changes", async () => {
  const res = await runStructuralRewrite(FILES, "alert($M)", "notify($M)");
  assert.equal(res.changes.length, 0);
  assert.equal(res.totalMatches, 0);
});
