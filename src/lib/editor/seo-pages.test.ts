import assert from "node:assert/strict";
import { test } from "node:test";
import { inferSeoPagePaths, mergeSeoPageCards } from "./seo-pages.ts";

test("inferSeoPagePaths always includes home and route files", () => {
  const paths = inferSeoPagePaths([
    { path: "src/pages/about.tsx" },
    { path: "src/pages/index.tsx" },
    { path: "src/pages/api/health.ts" },
    { path: "README.md" },
  ]);
  assert.ok(paths.includes("/"));
  assert.ok(paths.includes("/about"));
  assert.equal(paths.includes("/api/health"), false);
});

test("mergeSeoPageCards keeps edited titles", () => {
  const merged = mergeSeoPageCards(
    [{ path: "/about", title: "About us", description: "Team", ogImageUrl: "" }],
    ["/", "/about"],
    { title: "Acme", description: "Hello", ogImageUrl: "https://img" },
  );
  assert.equal(merged.find((r) => r.path === "/about")?.title, "About us");
  assert.equal(merged.find((r) => r.path === "/")?.title, "Acme");
});
