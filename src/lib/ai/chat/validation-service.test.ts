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

test("normalization repairs a default TanStack Start Vite plugin import", () => {
  const generated = tanstackStartScaffold({}, "CRM").map((file) =>
    file.path === "vite.config.ts"
      ? {
          ...file,
          content: file.content.replace(
            'import { tanstackStart } from "@tanstack/react-start/plugin/vite";',
            "import tanstackStart from '@tanstack/react-start/plugin/vite'",
          ),
        }
      : file,
  );

  const normalized = normalizeGenerationStage(generated, [], {
    prompt: "Build a CRM dashboard",
    framework: "tanstack",
    appType: "crm",
    brand: "CRM",
  });
  const viteConfig = normalized.files.find((file) => file.path === "vite.config.ts")?.content ?? "";

  assert.match(viteConfig, /import \{ tanstackStart \} from "@tanstack\/react-start\/plugin\/vite";/);
  assert.doesNotMatch(viteConfig, /import tanstackStart from/);
});

test("normalization repairs the plugin import when a landing page is classified as vite-app", () => {
  const generated = tanstackStartScaffold({}, "Bakery").map((file) =>
    file.path === "vite.config.ts"
      ? { ...file, content: file.content.replace("import { tanstackStart }", "import tanstackStart") }
      : file,
  );

  const normalized = normalizeGenerationStage(generated, [], {
    prompt: "Build a responsive landing page for a neighborhood bakery",
    framework: "react",
    appType: "marketing-website",
    brand: "Bakery",
  });
  const viteConfig = normalized.files.find((file) => file.path === "vite.config.ts")?.content ?? "";

  assert.match(viteConfig, /import \{ tanstackStart \}/);
});

test("normalization repairs the legacy TanStack root document API", () => {
  const generated = tanstackStartScaffold({}, "Bakery").map((file) =>
    file.path === "src/routes/__root.tsx"
      ? {
          ...file,
          content: file.content
            .replace(
              /import \{[\s\S]*?\} from "@tanstack\/react-router";/,
              'import { createRootRoute, Outlet } from "@tanstack/react-router";\nimport { Meta, Scripts, Links } from "@tanstack/react-start";',
            )
            .replace("<HeadContent />", "<Meta /><Links />"),
        }
      : file,
  );

  const normalized = normalizeGenerationStage(generated, [], {
    prompt: "Build a bakery website",
    framework: "tanstack",
  });
  const root = normalized.files.find((file) => file.path === "src/routes/__root.tsx")?.content ?? "";

  assert.match(root, /import \{ HeadContent as RouterHeadContent, Scripts \} from "@tanstack\/react-router";/);
  assert.match(root, /<RouterHeadContent \/>/);
  assert.doesNotMatch(root, /\b(?:Meta|Links)\b/);
  assert.doesNotMatch(root, /from "@tanstack\/react-start"/);
});

test("normalization exposes getRouter for a generated router constant", () => {
  const generated = tanstackStartScaffold({}, "Bakery").map((file) =>
    file.path === "src/router.tsx"
      ? {
          ...file,
          content: 'import { createRouter } from "@tanstack/react-router";\nimport { routeTree } from "./routeTree.gen";\nexport const router = createRouter({ routeTree });',
        }
      : file,
  );

  const normalized = normalizeGenerationStage(generated, [], {
    prompt: "Build a bakery website",
    framework: "tanstack",
  });
  const router = normalized.files.find((file) => file.path === "src/router.tsx")?.content ?? "";

  assert.match(router, /export function getRouter\(\)/);
  assert.match(router, /return createRouter\(\{/);
});

test("normalization repairs legacy document imports in route helper components", () => {
  const generated = [
    ...tanstackStartScaffold({}, "Bakery"),
    {
      path: "src/routes/-components/-head-content.tsx",
      language: "typescriptreact",
      content: "import { Meta, Links } from '@tanstack/react-router';\nexport function HeadContent() { return <><Meta /><Links /></>; }",
    },
  ];

  const normalized = normalizeGenerationStage(generated, [], {
    prompt: "Build a bakery website",
    framework: "tanstack",
  });
  const helper = normalized.files.find((file) => file.path.endsWith("-head-content.tsx"))?.content ?? "";

  assert.match(helper, /import \{ HeadContent as RouterHeadContent \} from '@tanstack\/react-router';/);
  assert.match(helper, /<RouterHeadContent \/>/);
  assert.doesNotMatch(helper, /\b(?:Meta|Links)\b/);
});

test("normalization moves current document primitives out of react-start", () => {
  const generated = tanstackStartScaffold({}, "Bakery").map((file) =>
    file.path === "src/routes/__root.tsx"
      ? {
          ...file,
          content: file.content.replace(
            'import {\n  Outlet,\n  createRootRoute,\n  HeadContent,\n  Scripts,\n} from "@tanstack/react-router";',
            'import { Outlet, createRootRoute } from "@tanstack/react-router";\nimport { HeadContent, Scripts } from "@tanstack/react-start";',
          ),
        }
      : file,
  );

  const normalized = normalizeGenerationStage(generated, [], {
    prompt: "Build a bakery website",
    framework: "tanstack",
  });
  const root = normalized.files.find((file) => file.path === "src/routes/__root.tsx")?.content ?? "";

  assert.match(root, /import \{ HeadContent, Scripts \} from "@tanstack\/react-router";/);
  assert.doesNotMatch(root, /\{ HeadContent, Scripts \} from "@tanstack\/react-start"/);
});

test("normalization replaces competing TanStack build configuration with one controlled set", () => {
  const generated = [
    ...tanstackStartScaffold({}, "Bakery"),
    {
      path: "tailwind.config.ts",
      language: "typescript",
      content: "export default { plugins: [tailwindcssAnimate] };",
    },
  ].map((file) =>
    file.path === "vite.config.ts"
      ? { ...file, content: "export default {};" }
      : file,
  );

  const normalized = normalizeGenerationStage(generated, [], {
    prompt: "Build a bakery website",
    framework: "tanstack",
    brand: "Bakery",
  });
  const configs = normalized.files.filter((file) => /^(?:vite|tailwind|postcss)\.config\./.test(file.path));
  const vite = normalized.files.find((file) => file.path === "vite.config.ts")?.content ?? "";
  const tailwind = normalized.files.find((file) => file.path === "tailwind.config.js")?.content ?? "";

  assert.equal(configs.filter((file) => file.path.startsWith("tailwind.config.")).length, 1);
  assert.match(vite, /tanstackStart\(\)/);
  assert.match(tailwind, /import tailwindcssAnimate/);
  assert.doesNotMatch(tailwind, /undefined/);
});
