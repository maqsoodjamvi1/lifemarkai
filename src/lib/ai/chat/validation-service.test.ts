import test from "node:test";
import assert from "node:assert/strict";
import { tanstackStartScaffold } from "../../templates/tanstack-start-scaffold.ts";
import { generationValidationSignature, normalizeGenerationStage, validateGenerationStage } from "./validation-service.ts";

test("normalization completes the TanStack package contract before correctness validation", () => {
  const generated = tanstackStartScaffold({}, "Neighborhood Bakery").map((file) => {
    if (file.path === "package.json") {
      return {
        ...file,
        content: JSON.stringify({
          name: "bakery",
          scripts: { dev: "vite dev", build: "vite build" },
          dependencies: { react: "^18.2.0" },
        }),
      };
    }
    if (file.path === "src/routes/index.tsx") {
      return {
        ...file,
        content: "export function Home() { return <><section /><section /><section /><section /><section /><section /></>; }",
      };
    }
    return file;
  });

  const normalized = normalizeGenerationStage(generated, [], {
    prompt: "Build a responsive landing page for a neighborhood bakery",
    framework: "tanstack",
    appType: "marketing-website",
    brand: "Neighborhood Bakery",
  });
  const packageFile = normalized.files.find((file) => file.path === "package.json");
  const pkg = JSON.parse(packageFile?.content ?? "{}");

  assert.equal(pkg.dependencies["@tanstack/react-router"], "^1.170.0");
  assert.equal(pkg.dependencies["@tanstack/react-start"], "^1.168.0");
  assert.equal(pkg.dependencies["class-variance-authority"], "^0.7.0");
  assert.equal(pkg.devDependencies.vite, "^7.0.0");
  assert.ok(normalized.controlledDependencies.some((change) => change.includes("@tanstack/react-router: missing")));

  const result = validateGenerationStage(normalized.files, [], {
    appType: "marketing-website",
    minFiles: 1,
    singlePage: true,
  });
  assert.ok(!result.correctnessErrors.some((error) => error.type === "missing_package"), JSON.stringify(result.correctnessErrors));
});

test("validation signatures detect a stalled repair despite message wording changes", () => {
  const first = generationValidationSignature([
    { type: "missing_package", file: "package.json", message: "first wording", severity: "error" },
    { type: "sparse_main_page", file: "src/routes/index.tsx", message: "first sparse wording", severity: "error" },
  ]);
  const second = generationValidationSignature([
    { type: "sparse_main_page", file: "src/routes/index.tsx", message: "different sparse wording", severity: "error" },
    { type: "missing_package", file: "package.json", message: "different wording", severity: "error" },
    { type: "advice", message: "warning does not block", severity: "warning" },
  ]);

  assert.equal(first, second);
});
