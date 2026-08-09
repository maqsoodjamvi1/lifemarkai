import assert from "node:assert/strict";
import { test } from "node:test";

import {
normalizeProjectImports,
relativeSpecifier,
repairImportsInFile,
} from "./normalize-imports.ts";

const UTILS = { path: "src/lib/utils.ts", content: "export function cn() {}\n" };

test("repairs the observed tooltip -> ../utils.ts break", () => {
  const files = [
    UTILS,
    {
      path: "src/components/ui/tooltip.tsx",
      content: 'import { cn } from "../utils.ts";\nexport const T = cn;\n',
    },
  ];
  const out = normalizeProjectImports(files);
  assert.match(out[1].content, /from "\.\.\/\.\.\/lib\/utils"/);
});

test("leaves resolvable relative imports alone", () => {
  const files = [
    UTILS,
    {
      path: "src/components/ui/tooltip.tsx",
      content: 'import { cn } from "../../lib/utils";\n',
    },
  ];
  assert.equal(normalizeProjectImports(files)[1].content, files[1].content);
});

test("leaves a resolvable @/ alias import alone", () => {
  const files = [
    UTILS,
    { path: "src/components/ui/card.tsx", content: 'import { cn } from "@/lib/utils";\n' },
  ];
  assert.equal(normalizeProjectImports(files)[1].content, files[1].content);
});

test("repairs a broken @/ alias import", () => {
  const files = [
    UTILS,
    { path: "src/components/ui/card.tsx", content: 'import { cn } from "@/utils";\n' },
  ];
  assert.match(normalizeProjectImports(files)[1].content, /from "\.\.\/\.\.\/lib\/utils"/);
});

test("never touches bare package specifiers", () => {
  const files = [
    UTILS,
    {
      path: "src/App.tsx",
      content: 'import React from "react";\nimport { z } from "zod";\n',
    },
  ];
  assert.equal(normalizeProjectImports(files)[1].content, files[1].content);
});

test("never touches assets or Vite query specifiers", () => {
  const files = [
    { path: "src/styles.css", content: "body{}" },
    { path: "src/lib/utils.ts", content: "export const cn = 1;" },
    {
      path: "src/routes/__root.tsx",
      content: 'import css from "../styles.css?url";\nimport "./missing.css";\n',
    },
  ];
  assert.equal(normalizeProjectImports(files)[2].content, files[2].content);
});

test("leaves routeTree.gen alone", () => {
  const files = [
    { path: "src/lib/utils.ts", content: "export const cn = 1;" },
    {
      path: "src/router.tsx",
      content: 'import { routeTree } from "./routeTree.gen";\n',
    },
  ];
  assert.equal(normalizeProjectImports(files)[1].content, files[1].content);
});

test("leaves a genuinely missing module alone (nothing to point at)", () => {
  const files = [
    UTILS,
    { path: "src/App.tsx", content: 'import Nav from "./components/Navbar";\n' },
  ];
  assert.equal(normalizeProjectImports(files)[1].content, files[1].content);
});

test("prefers the conventional target when several files share a basename", () => {
  const files = [
    UTILS,
    { path: "src/features/billing/deep/nested/utils.ts", content: "export const x = 1;" },
    { path: "src/components/ui/badge.tsx", content: 'import { cn } from "../utils";\n' },
  ];
  assert.match(normalizeProjectImports(files)[2].content, /from "\.\.\/\.\.\/lib\/utils"/);
});

test("repairs export-from and dynamic import too", () => {
  const files = [
    UTILS,
    {
      path: "src/components/ui/x.tsx",
      content: 'export { cn } from "../utils.ts";\nconst m = import("../utils.ts");\n',
    },
  ];
  const out = normalizeProjectImports(files)[1].content;
  assert.equal(/\.\.\/utils\.ts/.test(out), false);
  assert.equal((out.match(/\.\.\/\.\.\/lib\/utils/g) ?? []).length, 2);
});

test("does not point a file at itself", () => {
  const files = [
    { path: "src/lib/utils.ts", content: 'import { helper } from "./utils";\n' },
  ];
  assert.equal(normalizeProjectImports(files)[0].content, files[0].content);
});

test("repairImportsInFile works from a paths-only list", () => {
  const out = repairImportsInFile(
    "src/components/ui/tooltip.tsx",
    'import { cn } from "../utils.ts";\n',
    ["src/lib/utils.ts", "src/components/ui/tooltip.tsx"],
  );
  assert.match(out, /from "\.\.\/\.\.\/lib\/utils"/);
});

test("relativeSpecifier stays within the project", () => {
  assert.equal(
    relativeSpecifier("src/components/ui/tooltip.tsx", "src/lib/utils.ts"),
    "../../lib/utils",
  );
  assert.equal(relativeSpecifier("src/App.tsx", "src/lib/utils.ts"), "./lib/utils");
});
