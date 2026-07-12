import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseBrokenImports } from "./diagnose-imports";
import { appendPreviewDiagnosis, buildPreviewDiagnosis } from "./diagnose-preview";
import { diagnoseRuntimeErrors } from "./diagnose-runtime";

test("diagnoseBrokenImports catches project alias imports", () => {
  const issues = diagnoseBrokenImports([
    {
      path: "src/App.tsx",
      content: `import { Button } from "@/components/ui/Button";\nexport default function App(){ return <Button />; }`,
    },
  ]);

  assert.ok(
    issues.some((issue) => issue.includes("@/components/ui/Button") && issue.includes("file not found")),
    issues.join("\n"),
  );
});

test("diagnoseRuntimeErrors maps stack component to likely array guard", () => {
  const issues = diagnoseRuntimeErrors(
    [
      {
        kind: "runtime",
        message: "Cannot read properties of undefined (reading 'map')",
        stack: "TypeError: Cannot read properties of undefined\n    at PartnersSection (eval at run (about:srcdoc:56:20), <anonymous>:27:20)",
        timestamp: 1,
      },
    ],
    [
      {
        path: "src/components/home/PartnersSection.tsx",
        content: `export function PartnersSection({ partners }) {\n  return <div>{partners.map((p) => <span>{p.name}</span>)}</div>;\n}`,
      },
    ],
  );

  assert.ok(
    issues.some((issue) => issue.includes("PartnersSection.tsx:1") && issue.includes("Guard array data")),
    issues.join("\n"),
  );
});

test("diagnoseRuntimeErrors maps stack component to likely string guard", () => {
  const issues = diagnoseRuntimeErrors(
    [
      {
        kind: "runtime",
        message: "Cannot read properties of undefined (reading 'charAt')",
        stack: "TypeError: Cannot read properties of undefined\n    at ServicesPreview (eval at run (about:srcdoc:56:20), <anonymous>:57:15)",
        timestamp: 1,
      },
    ],
    [
      {
        path: "src/components/home/ServicesPreview.tsx",
        content: `export function ServicesPreview({ services }) {\n  return <div>{services.map((service) => <span>{service.title.charAt(0)}</span>)}</div>;\n}`,
      },
    ],
  );

  assert.ok(
    issues.some((issue) => issue.includes("ServicesPreview.tsx:1") && issue.includes("Guard string values")),
    issues.join("\n"),
  );
});

test("buildPreviewDiagnosis combines missing generated files and runtime guard hints", () => {
  const diagnosis = buildPreviewDiagnosis(
    [
      {
        path: "src/App.tsx",
        content: [
          `import { Card } from "./components/ui/Card";`,
          `import { Button } from "./components/ui/Button";`,
          `import Navbar from "./components/layout/Navbar";`,
          `import Portfolio from "./pages/Portfolio";`,
          `export default function App(){ return <><Navbar /><Portfolio /><Card><Button>Go</Button></Card></>; }`,
        ].join("\n"),
      },
      {
        path: "src/data/mock.ts",
        content: `import type { Service, PortfolioItem } from "../lib/types";\nexport const MOCK_SERVICES: Service[] = [];`,
      },
      {
        path: "src/components/home/PartnersSection.tsx",
        content: `export function PartnersSection({ partners }) {\n  return <div>{partners.map((p) => <span>{p.name}</span>)}</div>;\n}`,
      },
    ],
    [
      {
        kind: "runtime",
        message: "Cannot read properties of undefined (reading 'map')",
        stack: "TypeError: Cannot read properties of undefined\n    at PartnersSection (eval at run (about:srcdoc:56:20), <anonymous>:27:20)",
        timestamp: 1,
      },
    ],
  );

  assert.ok(diagnosis, "expected a diagnosis block");
  assert.match(diagnosis, /Runtime stack/);
  assert.match(diagnosis, /Imports \/ exports/);
  assert.match(diagnosis, /components\/ui\/Card/);
  assert.match(diagnosis, /components\/ui\/Button/);
  assert.match(diagnosis, /components\/layout\/Navbar/);
  assert.match(diagnosis, /pages\/Portfolio/);
  assert.match(diagnosis, /lib\/types/);
  assert.match(diagnosis, /Guard array data/);
});

test("appendPreviewDiagnosis avoids duplicate diagnosis blocks", () => {
  const prompt = "Fix the preview/runtime errors\n\nPreview diagnosis (fix these first):\n- existing";
  assert.equal(appendPreviewDiagnosis(prompt, [], []), prompt);
});
