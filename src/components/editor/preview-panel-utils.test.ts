import test from "node:test";
import assert from "node:assert/strict";
import type { ProjectFileLike } from "./preview-panel-utils.ts";
import { filesBelongToProject, getRefreshEffectiveFiles } from "./preview-panel-utils.ts";

test("filesBelongToProject skips a leftover tree from the previous editor project", () => {
  assert.equal(
    filesBelongToProject(
      [{ path: "store.js", content: "", project_id: "project-a" }],
      "project-b",
    ),
    false,
  );
  assert.equal(
    filesBelongToProject(
      [{ path: "store.js", content: "", project_id: "project-b" }],
      "project-b",
    ),
    true,
  );
  assert.equal(
    filesBelongToProject([{ path: "store.js", content: "" }], "project-b"),
    true,
  );
});

test("getRefreshEffectiveFiles returns latest files when version preview is active", () => {
  const propFiles: ProjectFileLike[] = [
    { path: "src/App.tsx", content: "prop" },
  ];
  const nextFiles: ProjectFileLike[] = [
    { path: "src/App.tsx", content: "next" },
  ];

  const effective = getRefreshEffectiveFiles("v1", propFiles, nextFiles);

  assert.equal(effective, propFiles);
});

test("getRefreshEffectiveFiles returns next files when version preview is not active", () => {
  const propFiles: ProjectFileLike[] = [
    { path: "src/App.tsx", content: "prop" },
  ];
  const nextFiles: ProjectFileLike[] = [
    { path: "src/App.tsx", content: "next" },
  ];

  const effective = getRefreshEffectiveFiles(null, propFiles, nextFiles);

  assert.equal(effective, nextFiles);
});

test("getRefreshEffectiveFiles returns undefined when no next files provided and version preview is inactive", () => {
  const propFiles: ProjectFileLike[] = [
    { path: "src/App.tsx", content: "prop" },
  ];

  const effective = getRefreshEffectiveFiles(null, propFiles, undefined);

  assert.equal(effective, undefined);
});
