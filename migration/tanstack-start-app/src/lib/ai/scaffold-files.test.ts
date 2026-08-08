import test from "node:test";
import assert from "node:assert/strict";
import {
countUserAuthoredFiles,
isGreenfieldProject,
SCAFFOLD_FILE_RE,
} from "./scaffold-files.ts";
import { lovableViteScaffold } from "../templates/lovable-vite-scaffold.ts";

/**
 * The real starter scaffold, path for path. If someone adds a file to
 * `lovableViteScaffold` and forgets to teach SCAFFOLD_FILE_RE about it, this
 * list stops matching production and the test below stops protecting anything —
 * so keep it in sync deliberately rather than trimming it to "a few examples".
 */
const SCAFFOLD = [
  "index.html",
  "package.json",
  "vite.config.ts",
  "components.json",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "tailwind.config.ts",
  "postcss.config.js",
  "eslint.config.js",
  ".gitignore",
  "README.md",
  "public/favicon.ico",
  "src/main.tsx",
  "src/App.tsx",
  "src/App.css",
  "src/index.css",
  "src/vite-env.d.ts",
  "src/lib/utils.ts",
  "src/hooks/use-mobile.tsx",
  "src/pages/Index.tsx",
  "src/pages/NotFound.tsx",
  "src/components/ui/button.tsx",
  "src/components/layout/Header.tsx",
  "src/components/layout/Footer.tsx",
].map((path) => ({ path, content: "x" }));

test("a pristine new project counts as zero user files", () => {
  // The whole bug in one assertion: files.length is 25, and 25 > 0 was the
  // test that sent a customer's first message down the incremental-edit path.
  assert.equal(SCAFFOLD.length, 25);
  assert.equal(countUserAuthoredFiles(SCAFFOLD), 0);
  assert.equal(isGreenfieldProject(SCAFFOLD), true);
});

test("every scaffold path is recognised individually", () => {
  for (const { path } of SCAFFOLD) {
    assert.equal(SCAFFOLD_FILE_RE.test(path), true, path);
  }
});

test("lovable Vite scaffold uses the alias import for cn helper", () => {
  const files = lovableViteScaffold("Acme");
  const tooltip = files.find((file) => file.path === "src/components/ui/tooltip.tsx");
  assert.ok(tooltip, "tooltip file exists in scaffold");
  assert.match(tooltip?.content ?? "", /from "@\/lib\/utils"/);
});

test("one real file is enough to stop being greenfield", () => {
  const withWork = [...SCAFFOLD, { path: "src/pages/Dashboard.tsx", content: "..." }];
  assert.equal(countUserAuthoredFiles(withWork), 1);
  assert.equal(isGreenfieldProject(withWork), false);
});

test("a grown home page counts as real work even though its path is scaffold", () => {
  // An app can legitimately live entirely in Index.tsx.
  const grown = SCAFFOLD.map((f) =>
    f.path === "src/pages/Index.tsx" ? { ...f, content: "a".repeat(1501) } : f,
  );
  assert.equal(countUserAuthoredFiles(grown), 1);
  assert.equal(isGreenfieldProject(grown), false);
});

test("a placeholder home page does not count", () => {
  // The real starter Index.tsx is ~432 bytes; the threshold is 1500.
  const placeholder = SCAFFOLD.map((f) =>
    f.path === "src/pages/Index.tsx" ? { ...f, content: "a".repeat(432) } : f,
  );
  assert.equal(countUserAuthoredFiles(placeholder), 0);
});

test("the TanStack shape of the same scaffold is also recognised", () => {
  for (const path of ["src/router.tsx", "src/routeTree.gen.ts", "src/routes/__root.tsx", "src/routes/index.tsx"]) {
    assert.equal(SCAFFOLD_FILE_RE.test(path), true, path);
  }
});

test("windows-style separators are normalised before matching", () => {
  assert.equal(countUserAuthoredFiles([{ path: "src\\pages\\Index.tsx", content: "x" }]), 0);
  assert.equal(countUserAuthoredFiles([{ path: "src\\pages\\Pricing.tsx", content: "x" }]), 1);
});

test("a nested ui primitive is scaffold, a nested feature component is not", () => {
  assert.equal(countUserAuthoredFiles([{ path: "src/components/ui/dialog.tsx" }]), 0);
  assert.equal(countUserAuthoredFiles([{ path: "src/components/ProductCard.tsx" }]), 1);
});

test("an empty project is greenfield", () => {
  assert.equal(isGreenfieldProject([]), true);
});

test("a missing content field never throws", () => {
  assert.equal(countUserAuthoredFiles([{ path: "src/pages/Index.tsx" }]), 0);
  assert.equal(countUserAuthoredFiles([{ path: "src/pages/Index.tsx", content: null }]), 0);
});
