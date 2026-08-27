/**
 * Libraries as a checked contract. The two failure modes pinned here are the
 * ones production actually pays for: an allowed package imported but never
 * declared (dies later in the sandbox as an opaque TS2307), and a refused or
 * hallucinated package that nothing ever named as the problem.
 *
 *   node --import tsx --test src/lib/verify/dependency-gate.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { findDependencyIssues, syncProjectDependencies } from "./dependency-gate.ts";

const PKG = JSON.stringify({
  name: "app",
  dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
});

const f = (path: string, content: string) => ({ path, content });

describe("findDependencyIssues", () => {
  it("an allowed package imported but undeclared is missing, not an error", () => {
    const issues = findDependencyIssues([
      f("package.json", PKG),
      f("src/Chart.tsx", 'import { LineChart } from "recharts";\nexport default () => <LineChart/>;'),
    ]);
    assert.deepEqual(issues.missingAllowed, ["recharts"]);
    assert.deepEqual(issues.disallowed, []);
  });

  it("a refused package becomes a located error naming the file, line and package", () => {
    const issues = findDependencyIssues([
      f("package.json", PKG),
      f("src/App.tsx", '// header\nimport m from "moment";\nexport default () => null;'),
    ]);
    assert.equal(issues.disallowed.length, 1);
    const d = issues.disallowed[0];
    assert.equal(d.importer, "src/App.tsx");
    assert.equal(d.line, 2);
    assert.equal(d.package, "moment");
    assert.match(d.formatted, /not in the allowed/);
    assert.match(d.formatted, /do not add it to package\.json/);
  });

  it("subpaths and scoped prefixes resolve to the real package name", () => {
    const issues = findDependencyIssues([
      f("package.json", PKG),
      f(
        "src/a.ts",
        'import merge from "lodash/merge";\nimport { Root } from "@radix-ui/react-progress";',
      ),
    ]);
    // @radix-ui/react-* is an allowed prefix rule; lodash is not on the list.
    assert.deepEqual(issues.missingAllowed, ["@radix-ui/react-progress"]);
    assert.deepEqual(issues.disallowed.map((d) => d.package), ["lodash"]);
  });

  it("relative, alias, node: and builtin specifiers are never flagged", () => {
    const issues = findDependencyIssues([
      f("package.json", PKG),
      f(
        "src/a.ts",
        [
          'import x from "./local";',
          'import y from "@/lib/utils";',
          'import { fileURLToPath } from "node:url";',
          'import React from "react";',
        ].join("\n"),
      ),
    ]);
    assert.deepEqual(issues.missingAllowed, []);
    assert.deepEqual(issues.disallowed, []);
  });

  it("no package.json in the set means no opinion at all", () => {
    const issues = findDependencyIssues([f("src/a.ts", 'import m from "moment";')]);
    assert.deepEqual(issues.missingAllowed, []);
    assert.deepEqual(issues.disallowed, []);
  });

  it("one error per (file, package), however many import lines repeat it", () => {
    const issues = findDependencyIssues([
      f("package.json", PKG),
      f("src/a.ts", 'import a from "moment";\nimport b from "moment/locale/de";'),
    ]);
    assert.equal(issues.disallowed.length, 1);
  });
});

describe("syncProjectDependencies", () => {
  it("writes allowed missing packages at pinned versions; refuses the rest", () => {
    const out = syncProjectDependencies([
      f("package.json", PKG),
      f("src/a.tsx", 'import { LineChart } from "recharts";\nimport m from "moment";'),
    ]);
    assert.deepEqual(out.added, ["recharts"]);
    const pkg = JSON.parse(out.files.find((x) => x.path === "package.json")!.content!);
    assert.equal(pkg.dependencies.recharts, "^2.12.7"); // the allowlist pin, not "latest"
    assert.equal(pkg.dependencies.moment, undefined);
  });

  it("is a no-op returning the same array when nothing needs adding", () => {
    const files = [f("package.json", PKG), f("src/a.ts", 'import React from "react";')];
    const out = syncProjectDependencies(files);
    assert.equal(out.files, files);
    assert.deepEqual(out.added, []);
  });
});
