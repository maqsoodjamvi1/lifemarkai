import assert from "node:assert/strict";
import test from "node:test";
import { buildEnvironmentGraph,classifyRepairFailure } from "./env-graph.ts";

test("builds dependency and internal-reference graphs", () => {
  const graph = buildEnvironmentGraph([
    { path: "package.json", content: JSON.stringify({ dependencies: { react: "19" }, scripts: { build: "vite build" } }) },
    { path: "src/routes/index.tsx", content: "import { Card } from '@/components/Card'; export default function Page(){ return <Card /> }\nconsole.log(import.meta.env.VITE_API)" },
  ]);
  assert.equal(graph.dependencies.has("react"), true);
  assert.equal(graph.imports.get("src/routes/index.tsx")?.has("@/components/Card"), true);
  assert.equal(graph.environment.has("VITE_API"), true);
  assert.equal(graph.routes.has("src/routes/index.tsx"), true);
});

test("classifies failures before repair", () => {
  assert.equal(classifyRepairFailure(["Cannot find module '@/missing'"]).layer, "internal-reference");
  assert.equal(classifyRepairFailure(["npm ERR! ERESOLVE dependency tree"]).layer, "dependency");
  assert.equal(classifyRepairFailure(["Uncaught TypeError: x is not a function"]).layer, "browser-runtime");
});
