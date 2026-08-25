import test from "node:test";
import assert from "node:assert/strict";
import { validateGeneratedFiles } from "./code-parser.ts";

test("import type { Name } is not treated as a missing default export", () => {
  const errors = validateGeneratedFiles(
    [
      {
        path: "src/App.tsx",
        language: "typescriptreact",
        content:
          "import type { Item } from '@/lib/types';\nexport default function App(){ return null; }",
      },
      {
        path: "src/lib/types.ts",
        language: "typescript",
        content: "export type Item = { id: string };",
      },
      {
        path: "package.json",
        language: "json",
        content: '{"scripts":{"dev":"vite"},"dependencies":{"react":"^18.0.0"}}',
      },
      {
        path: "index.html",
        language: "html",
        content: '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
      },
      {
        path: "src/main.tsx",
        language: "typescriptreact",
        content: 'import App from "./App";\n',
      },
      { path: "vite.config.ts", language: "typescript", content: "export default {}" },
      { path: "tsconfig.json", language: "json", content: "{}" },
    ],
    [],
  );

  assert.equal(
    errors.filter((error) => error.type === "missing_default_export").length,
    0,
    JSON.stringify(errors.filter((error) => error.type === "missing_default_export")),
  );
});
