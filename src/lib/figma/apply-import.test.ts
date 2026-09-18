import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFigmaImportFiles,
  importPathForApp,
  pickAppEntryPath,
} from "./apply-import.ts";

test("pickAppEntryPath prefers src/App.tsx when present", () => {
  assert.equal(pickAppEntryPath(["src/main.tsx", "src/App.tsx"]), "src/App.tsx");
  assert.equal(pickAppEntryPath([]), "src/App.tsx");
});

test("pickAppEntryPath uses the TanStack file route on Start apps", () => {
  assert.equal(pickAppEntryPath(["src/routes/__root.tsx", "src/routes/index.tsx"]), "src/routes/index.tsx");
});

test("importPathForApp is relative to the App file", () => {
  assert.equal(importPathForApp("src/App.tsx", "Hero"), "./components/figma/Hero");
  assert.equal(importPathForApp("src/routes/index.tsx", "Hero"), "../components/figma/Hero");
  assert.equal(importPathForApp("App.tsx", "Hero"), "./src/components/figma/Hero");
});

test("buildFigmaImportFiles writes components and mounts the first frame as App", () => {
  const files = buildFigmaImportFiles(["src/App.tsx"], [
    { componentName: "Hero", code: "export function Hero() {\n  return <div />;\n}\n" },
    { componentName: "Hero", code: "export function Hero() {\n  return <span />;\n}\n" },
  ]);
  assert.equal(files[0]?.path, "src/components/figma/Hero.tsx");
  assert.equal(files[1]?.path, "src/components/figma/Hero2.tsx");
  const app = files.find((f) => f.path === "src/App.tsx");
  assert.ok(app?.content.includes('from "./components/figma/Hero"'));
  assert.ok(app?.content.includes("return <Hero />"));
});

test("buildFigmaImportFiles mounts the first frame as a TanStack file route", () => {
  const files = buildFigmaImportFiles(["src/routes/__root.tsx", "src/routes/index.tsx"], [
    { componentName: "Hero", code: "export function Hero() {\n  return <div />;\n}\n" },
  ]);
  assert.equal(files.some((f) => f.path === "src/App.tsx"), false);
  const home = files.find((f) => f.path === "src/routes/index.tsx");
  assert.ok(home?.content.includes("createFileRoute"));
  assert.ok(home?.content.includes('from "../components/figma/Hero"'));
});
