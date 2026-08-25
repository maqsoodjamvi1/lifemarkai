import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { describeRejectedGeneration, summariseFile } from "./generation-diagnostics.ts";

const SPARSE_ERROR =
  "src/routes/index.tsx is too sparse — a landing/home/storefront page must have 5+ content-rich sections (hero, grids of 8+ items, value props, footer), not a heading and a sentence.";

describe("describeRejectedGeneration", () => {
  it("summarises the file the validator actually named", () => {
    const result = describeRejectedGeneration(
      [
        { path: "src/routes/index.tsx", content: "<h1>Bakery</h1><p>Fresh bread.</p>" },
        { path: "src/routes/__root.tsx", content: "shell" },
      ],
      [SPARSE_ERROR],
    );

    assert.equal(result.offenders.length, 1);
    assert.equal(result.offenders[0].path, "src/routes/index.tsx");
    assert.equal(result.fileCount, 2);
    assert.match(result.summaryLine, /src\/routes\/index\.tsx/);
  });

  // The distinction the whole module exists for: a route that renders a
  // component is well-factored, not empty, and every richness heuristic
  // misreads it. The imports are what make that visible.
  it("exposes delegation — a thin route that imports its content", () => {
    const result = describeRejectedGeneration(
      [
        {
          path: "src/routes/index.tsx",
          content: 'import Landing from "@/components/Landing";\nexport default () => <Landing />;',
        },
      ],
      [SPARSE_ERROR],
    );

    assert.deepEqual(result.offenders[0].localImports, ["@/components/Landing"]);
    assert.match(result.summaryLine, /imports @\/components\/Landing/);
  });

  it("says so plainly when a thin file imports nothing — genuinely empty", () => {
    const result = describeRejectedGeneration(
      [{ path: "src/routes/index.tsx", content: "<h1>Bakery</h1>" }],
      [SPARSE_ERROR],
    );

    assert.deepEqual(result.offenders[0].localImports, []);
    assert.match(result.summaryLine, /no local imports/);
  });

  it("ignores package imports — only project-local ones indicate delegation", () => {
    const summary = summariseFile({
      path: "src/routes/index.tsx",
      content: 'import React from "react";\nimport { Hero } from "../components/Hero";\nimport "./index.css";',
    });

    assert.deepEqual(summary.localImports, ["../components/Hero", "./index.css"]);
  });

  it("counts markup shape, not content", () => {
    const summary = summariseFile({
      path: "p.tsx",
      content: "<section><h1>a</h1></section><section><p>b</p></section>",
    });

    assert.equal(summary.sections, 2);
    assert.equal(summary.jsxTags, 4);
    assert.equal(summary.bytes, 56);
  });

  // This string is appended to an error that reaches the client and the logs.
  // Neither is a place to spill a user's generated source.
  it("never leaks file contents into the summary", () => {
    const secretish = "const API_KEY = 'sk-do-not-log-me';".repeat(20);
    const result = describeRejectedGeneration(
      [{ path: "src/routes/index.tsx", content: secretish }],
      [SPARSE_ERROR],
    );

    assert.doesNotMatch(result.summaryLine, /sk-do-not-log-me/);
    assert.ok(result.summaryLine.length <= 400);
  });

  it("stays bounded when many files are named", () => {
    const files = Array.from({ length: 40 }, (_, i) => ({
      path: `src/routes/page${i}.tsx`,
      content: "<h1>x</h1>",
    }));
    const errors = files.map((f) => `${f.path} is too sparse`);
    const result = describeRejectedGeneration(files, errors);

    assert.ok(result.offenders.length <= 3);
    assert.ok(result.summaryLine.length <= 400);
    assert.equal(result.fileCount, 40);
  });

  it("still reports the inventory when no file is named", () => {
    const result = describeRejectedGeneration(
      [{ path: "src/routes/index.tsx", content: "abc" }],
      ["the build is missing a package.json"],
    );

    assert.equal(result.offenders.length, 0);
    assert.match(result.summaryLine, /generated 1 file\(s\), 3B total/);
  });

  it("tolerates malformed input rather than throwing inside a failure path", () => {
    assert.equal(describeRejectedGeneration([], []).fileCount, 0);
    assert.equal(
      describeRejectedGeneration(
        undefined as unknown as { path: string; content: string }[],
        undefined as unknown as string[],
      ).fileCount,
      0,
    );
  });
});
