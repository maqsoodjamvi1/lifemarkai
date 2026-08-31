import assert from "node:assert/strict";
import test from "node:test";
import { healPreviewContractGaps } from "./heal-preview-contract.ts";
import type { ProjectFile } from "../../types/database.ts";

function file(path: string, content: string): ProjectFile {
  return {
    id: `id-${path}`,
    project_id: "proj-1",
    path,
    content,
    language: "typescript",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as ProjectFile;
}

// Regression: a missing import of a kebab-case basename ("hero-section.tsx" —
// common in generated apps) used to stub itself as
// `export function hero-section() {}`, which is invalid JS (a hyphen isn't a
// valid identifier character). The stub that exists specifically to keep a
// missing-import error from crashing the preview crashed it in a NEW way
// instead — a SyntaxError in the stub file itself.
test("stubs a missing kebab-case component import with a valid JS identifier", () => {
  const healed = healPreviewContractGaps([
    file(
      "src/App.tsx",
      'import Hero from "./components/hero-section";\nexport default function App(){ return <Hero />; }',
    ),
  ]);

  const stub = healed.find((f) => f.path === "src/components/hero-section.tsx");
  assert.ok(stub, "expected a stub file to be created for the missing import");
  assert.doesNotMatch(stub!.content ?? "", /export function hero-section/);
  assert.match(stub!.content ?? "", /export function HeroSection\(\)/);
  assert.match(stub!.content ?? "", /export default HeroSection;/);
});

test("stubs a missing snake_case page import with a valid JS identifier", () => {
  const healed = healPreviewContractGaps([
    file(
      "src/App.tsx",
      'import NotFound from "./pages/not_found";\nexport default function App(){ return <NotFound />; }',
    ),
  ]);
  const stub = healed.find((f) => f.path === "src/pages/not_found.tsx");
  assert.ok(stub);
  assert.match(stub!.content ?? "", /export default function NotFound\(\)/);
});

// Regression: appendMissingExport's own duplicate guard only matched a name
// declared immediately after `export const`, missing one declared later in a
// comma-separated list. Combined with the (now-fixed) upstream false
// positive in findMissingExports for the same shape, healing used to append
// a SECOND `export const MOCK_PARTNERS` onto a file that already exported it
// via a comma list — a duplicate-identifier SyntaxError. This pins the
// end-to-end behavior: healing a project with a comma-declared export must
// be a no-op on that file.
test("does not duplicate an export already declared in a comma-separated list", () => {
  const mockFile = file(
    "src/data/mock.ts",
    "export const MOCK_SERVICES = [], MOCK_PARTNERS = [];",
  );
  const healed = healPreviewContractGaps([
    mockFile,
    file(
      "src/components/home/PartnersSection.tsx",
      'import { MOCK_PARTNERS } from "../../data/mock";\nexport function PartnersSection(){ return null; }',
    ),
  ]);
  const healedMock = healed.find((f) => f.path === "src/data/mock.ts");
  assert.ok(healedMock);
  assert.equal(healedMock!.content, mockFile.content, "the comma-declared export must not be touched");
  const occurrences = (healedMock!.content?.match(/MOCK_PARTNERS/g) ?? []).length;
  assert.equal(occurrences, 1, "MOCK_PARTNERS must only be declared once");
});
