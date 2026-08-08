import test from "node:test";
import assert from "node:assert/strict";
import type { ProjectFile } from "../../types/database.ts";
import { getRefreshEffectiveFiles } from "./preview-panel-utils.ts";

test("getRefreshEffectiveFiles returns latest files when version preview is active", () => {
  const propFiles: ProjectFile[] = [
    { path: "src/App.tsx", content: "prop" },
  ];
  const nextFiles: ProjectFile[] = [
    { path: "src/App.tsx", content: "next" },
  ];

  const effective = getRefreshEffectiveFiles("v1", propFiles, nextFiles);

  assert.equal(effective, propFiles);
});

test("getRefreshEffectiveFiles returns next files when version preview is not active", () => {
  const propFiles: ProjectFile[] = [
    { path: "src/App.tsx", content: "prop" },
  ];
  const nextFiles: ProjectFile[] = [
    { path: "src/App.tsx", content: "next" },
  ];

  const effective = getRefreshEffectiveFiles(null, propFiles, nextFiles);

  assert.equal(effective, nextFiles);
});

test("getRefreshEffectiveFiles returns undefined when no next files provided and version preview is inactive", () => {
  const propFiles: ProjectFile[] = [
    { path: "src/App.tsx", content: "prop" },
  ];

  const effective = getRefreshEffectiveFiles(null, propFiles, undefined);

  assert.equal(effective, undefined);
});
