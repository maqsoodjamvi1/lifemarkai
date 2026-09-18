import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEnvGraph,
  classifyPreviewFailureLayer,
  layerForError,
  targetedRepairHint,
} from "./env-graph.ts";

test("builds separate runtime and internal graphs from files and contract", () => {
  const graph = buildEnvGraph(
    [
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: { "@tanstack/react-router": "1.0.0", react: "19.0.0" },
          engines: { node: "22" },
        }),
      },
      {
        path: "src/routes/index.tsx",
        content: `import { createFileRoute } from "@tanstack/react-router";\nimport { Header } from "@/components/Header";\nexport const Route = createFileRoute("/")({ component: Home });\nconst url = import.meta.env.VITE_SUPABASE_URL;\n`,
      },
      {
        path: "src/components/Header.tsx",
        content: `export function Header() { return null; }\n`,
      },
    ],
    {
      version: 1,
      framework: "tanstack-start",
      appType: "website",
      files: [
        { path: "src/components/Header.tsx", purpose: "header", owner: "scaffold", exports: [{ name: "Header", kind: "named" }], dependsOn: [] },
        { path: "src/routes/index.tsx", purpose: "home", owner: "product", exports: [{ name: "Route", kind: "named" }], dependsOn: ["src/components/Header.tsx"] },
      ],
      routes: [{ path: "/", file: "src/routes/index.tsx" }],
      packages: [{ name: "@tanstack/react-start" }],
      acceptanceTests: [],
    },
  );
  assert.ok(graph.runtime.some((node) => node.kind === "package" && node.name === "@tanstack/react-router"));
  assert.ok(graph.runtime.some((node) => node.kind === "package" && node.name === "@tanstack/react-start"));
  assert.ok(graph.runtime.some((node) => node.kind === "engine" && node.name === "node"));
  assert.ok(graph.runtime.some((node) => node.kind === "env" && node.name === "VITE_SUPABASE_URL"));
  const home = graph.internal.find((node) => node.path === "src/routes/index.tsx");
  assert.equal(home?.route, "/");
  assert.ok(home?.imports.some((item) => item.includes("Header") || item.includes("@tanstack/react-router")));
  assert.ok(graph.internal.some((node) => node.path === "src/components/Header.tsx" && node.exports.includes("Header")));
});

test("classifies failures into EnvGraph layers before repair", () => {
  assert.equal(layerForError({ type: "undeclared_package", message: "left-pad is undeclared" }), "dependency");
  assert.equal(layerForError({ message: "zod is not on the install allowlist" }), "dependency");
  assert.equal(layerForError({ type: "missing_contract_export", message: "Header must export Header" }), "internal-reference");
  assert.equal(layerForError({ message: "src/App.tsx:2:1 — TS2304: Cannot find name Foo" }), "build");
  assert.equal(layerForError({ message: "vite build failed to compile" }), "build");
  assert.equal(layerForError({ message: "Preview timed out after 60000ms" }), "boot");
  assert.equal(layerForError({ message: "App rendered an empty page — #root has no children after mount." }), "browser-runtime");
  assert.equal(
    classifyPreviewFailureLayer([
      { message: "Cannot find module 'lucide-react'" },
      { message: "Cannot find module 'date-fns'" },
      { message: "Uncaught TypeError" },
    ]),
    "dependency",
  );
  assert.match(targetedRepairHint("internal-reference"), /internal reference/);
});
