import test from "node:test";
import assert from "node:assert/strict";
import { validateGeneratedFiles } from "./code-parser.ts";
import { buildFallbackProjectContract, parseProjectContract } from "./project-contract.ts";

test("inline type imports validate their exported names and still reject missing types", () => {
  const errors = validateGeneratedFiles([
    { path: "src/page.ts", language: "typescript", content: "import { value, type MenuItem as Item, type Missing } from './data';" },
    { path: "src/data.ts", language: "typescript", content: "export const value = 1; export interface MenuItem { label: string }" },
  ], []);
  const missing = errors.filter((error) => error.type === "missing_named_export");
  assert.equal(missing.length, 1);
  assert.match(missing[0].message, /\{ Missing \}/);
  assert.doesNotMatch(missing[0].message, /MenuItem/);
});

test("model router plans respect platform-owned exports and generated route trees", () => {
  const contract = buildFallbackProjectContract("Build a bakery landing page");
  contract.files.push({ path: "src/routeTree.gen.ts", purpose: "Generated routes", owner: "scaffold", exports: [{ name: "routeTree", kind: "named" }], dependsOn: [] });
  const router = contract.files.find((file) => file.path === "src/router.tsx")!;
  router.exports.push({ name: "router", kind: "named" });
  router.dependsOn.push("src/routeTree.gen.ts");
  const result = parseProjectContract(contract);
  assert.equal(result.issues.filter((issue) => issue.severity === "error").length, 0);
  assert.equal(result.contract.files.some((file) => file.path === "src/routeTree.gen.ts"), false);
  assert.deepEqual(result.contract.files.find((file) => file.path === "src/router.tsx")?.exports, [{ name: "getRouter", kind: "named" }]);
});
